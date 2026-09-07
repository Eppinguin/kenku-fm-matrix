import {
  BrowserWindow,
  ipcMain,
  net,
  safeStorage,
  shell,
} from "electron";
import Store from "electron-store";
import { randomUUID } from "crypto";
import { createServer, type Server } from "http";

import type {
  MatrixLiveKitTokenRequest,
  MatrixSessionCredentials,
  MatrixSfuConfig,
} from "../../matrix/types";

type MatrixStoredSession = Omit<MatrixSessionCredentials, "accessToken"> & {
  encryptedAccessToken: string;
};

type MatrixCredentialStoreSchema = {
  session?: MatrixStoredSession;
};

const MATRIX_SSO_TIMEOUT_MS = 5 * 60 * 1000;

const MATRIX_RENDERER_CHANNELS = new Set([
  "MATRIX_READY",
  "MATRIX_DISCONNECTED",
  "MATRIX_LOGIN_FLOWS",
  "MATRIX_ROOMS",
  "MATRIX_ROOM_JOINED",
  "MATRIX_ROOM_LEFT",
  "ERROR",
  "MESSAGE",
  "INFO",
]);

/**
 * Owns the privileged parts of Matrix integration:
 * - SSO browser/callback handling
 * - secure credential persistence
 * - MatrixRTC authorization requests
 * - IPC between the application renderer and hidden audio renderer
 */
export class MatrixManagerMain {
  _appWindow: BrowserWindow;
  _captureWindow: BrowserWindow;
  _credentialStore: Store<MatrixCredentialStoreSchema>;
  _ssoServer?: Server;
  _ssoTimeout?: NodeJS.Timeout;

  constructor(appWindow: BrowserWindow, captureWindow: BrowserWindow) {
    this._appWindow = appWindow;
    this._captureWindow = captureWindow;
    this._credentialStore = new Store<MatrixCredentialStoreSchema>({
      name: "matrix-credentials",
    });

    ipcMain.on("MATRIX_GET_LOGIN_FLOWS", this._handleGetLoginFlows);
    ipcMain.on("MATRIX_LOGIN_PASSWORD", this._handleLoginPassword);
    ipcMain.on("MATRIX_LOGIN_TOKEN", this._handleLoginToken);
    ipcMain.on("MATRIX_LOGIN_SSO", this._handleLoginSso);
    ipcMain.on("MATRIX_RESTORE_SESSION", this._handleRestoreSession);
    ipcMain.on("MATRIX_LOGOUT", this._handleLogout);
    ipcMain.on("MATRIX_DISCONNECT", this._handleDisconnect);
    ipcMain.on("MATRIX_JOIN_ROOM", this._handleJoinRoom);
    ipcMain.on("MATRIX_LEAVE_ROOM", this._handleLeaveRoom);
    ipcMain.on("MATRIX_CAPTURE_EVENT", this._handleCaptureEvent);
    ipcMain.on("MATRIX_SAVE_SESSION", this._handleSaveSession);
    ipcMain.on("MATRIX_CLEAR_SESSION", this._handleClearSession);
    ipcMain.handle("MATRIX_GET_LIVEKIT_TOKEN", this._handleGetLiveKitToken);
  }

  destroy(): void {
    // Best-effort leave before the hidden audio renderer is destroyed.
    this._sendToCaptureWindow("MATRIX_DISCONNECT");

    ipcMain.off("MATRIX_GET_LOGIN_FLOWS", this._handleGetLoginFlows);
    ipcMain.off("MATRIX_LOGIN_PASSWORD", this._handleLoginPassword);
    ipcMain.off("MATRIX_LOGIN_TOKEN", this._handleLoginToken);
    ipcMain.off("MATRIX_LOGIN_SSO", this._handleLoginSso);
    ipcMain.off("MATRIX_RESTORE_SESSION", this._handleRestoreSession);
    ipcMain.off("MATRIX_LOGOUT", this._handleLogout);
    ipcMain.off("MATRIX_DISCONNECT", this._handleDisconnect);
    ipcMain.off("MATRIX_JOIN_ROOM", this._handleJoinRoom);
    ipcMain.off("MATRIX_LEAVE_ROOM", this._handleLeaveRoom);
    ipcMain.off("MATRIX_CAPTURE_EVENT", this._handleCaptureEvent);
    ipcMain.off("MATRIX_SAVE_SESSION", this._handleSaveSession);
    ipcMain.off("MATRIX_CLEAR_SESSION", this._handleClearSession);
    ipcMain.removeHandler("MATRIX_GET_LIVEKIT_TOKEN");
    this._closeSsoServer();
  }

  _sendToCaptureWindow = (channel: string, ...args: unknown[]): void => {
    const contents = this._captureWindow.webContents;
    if (contents.isDestroyed()) return;

    const send = () => contents.send(channel, ...args);
    if (contents.isLoading()) {
      contents.once("did-finish-load", send);
    } else {
      send();
    }
  };

  _sendToAppWindow = (channel: string, ...args: unknown[]): void => {
    const contents = this._appWindow.webContents;
    if (!contents.isDestroyed()) {
      contents.send(channel, ...args);
    }
  };

  _handleGetLoginFlows = (
    _: Electron.IpcMainEvent,
    homeserver: string,
  ): void => {
    this._sendToCaptureWindow("MATRIX_GET_LOGIN_FLOWS", homeserver);
  };

  _handleLoginPassword = (
    _: Electron.IpcMainEvent,
    homeserver: string,
    username: string,
    password: string,
  ): void => {
    this._sendToCaptureWindow(
      "MATRIX_LOGIN_PASSWORD",
      homeserver,
      username,
      password,
    );
  };

  _handleLoginToken = (
    _: Electron.IpcMainEvent,
    homeserver: string,
    accessToken: string,
  ): void => {
    this._sendToCaptureWindow("MATRIX_LOGIN_TOKEN", homeserver, accessToken);
  };

  _handleLoginSso = async (
    _: Electron.IpcMainEvent,
    homeserver: string,
  ): Promise<void> => {
    const baseUrl = this._normalizeHomeserver(homeserver);
    if (!baseUrl) {
      this._sendToAppWindow("MATRIX_DISCONNECTED");
      this._sendToAppWindow("ERROR", "Matrix homeserver is required");
      return;
    }

    this._closeSsoServer();

    const callbackPath = `/matrix-sso/${randomUUID()}`;
    const server = createServer((request, response) => {
      const address = server.address();
      if (!address || typeof address === "string") {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Kenku FM Matrix login callback failed.");
        return;
      }

      const callbackBase = `http://127.0.0.1:${address.port}`;
      const callbackUrl = new URL(request.url ?? "/", callbackBase);
      if (callbackUrl.pathname !== callbackPath) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const loginToken = callbackUrl.searchParams.get("loginToken");
      if (!loginToken) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<html><body><h2>Matrix sign-in failed</h2><p>No login token was returned. You can close this tab.</p></body></html>",
        );
        this._sendToAppWindow("MATRIX_DISCONNECTED");
        this._sendToAppWindow("ERROR", "Matrix SSO did not return a login token");
        this._closeSsoServer();
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        "<html><body><h2>Signed in to Matrix</h2><p>You can close this tab and return to Kenku FM.</p></body></html>",
      );

      this._closeSsoServer();
      this._sendToCaptureWindow("MATRIX_LOGIN_SSO_TOKEN", baseUrl, loginToken);
    });

    this._ssoServer = server;
    server.on("error", (error) => {
      this._sendToAppWindow("MATRIX_DISCONNECTED");
      this._sendToAppWindow(
        "ERROR",
        `Unable to start Matrix SSO callback: ${error.message}`,
      );
      this._closeSsoServer();
    });

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") return;

      const redirectUrl = `http://127.0.0.1:${address.port}${callbackPath}`;
      const ssoUrl = `${baseUrl}/_matrix/client/v3/login/sso/redirect?redirectUrl=${encodeURIComponent(
        redirectUrl,
      )}`;

      try {
        await shell.openExternal(ssoUrl);
      } catch (error) {
        this._sendToAppWindow("MATRIX_DISCONNECTED");
        this._sendToAppWindow(
          "ERROR",
          `Unable to open Matrix SSO in your browser: ${String(error)}`,
        );
        this._closeSsoServer();
      }
    });

    this._ssoTimeout = setTimeout(() => {
      this._sendToAppWindow("MATRIX_DISCONNECTED");
      this._sendToAppWindow("ERROR", "Matrix SSO sign-in timed out");
      this._closeSsoServer();
    }, MATRIX_SSO_TIMEOUT_MS);
  };

  _handleRestoreSession = (): void => {
    const session = this._loadSession();
    if (session) {
      this._sendToCaptureWindow("MATRIX_CONNECT_SESSION", session);
    } else {
      this._sendToAppWindow("MATRIX_DISCONNECTED");
    }
  };

  _handleLogout = (): void => {
    this._sendToCaptureWindow("MATRIX_LOGOUT");
  };

  _handleDisconnect = (): void => {
    this._sendToCaptureWindow("MATRIX_DISCONNECT");
  };

  _handleJoinRoom = (_: Electron.IpcMainEvent, roomId: string): void => {
    this._sendToCaptureWindow("MATRIX_JOIN_ROOM", roomId);
  };

  _handleLeaveRoom = (_: Electron.IpcMainEvent, roomId: string): void => {
    this._sendToCaptureWindow("MATRIX_LEAVE_ROOM", roomId);
  };

  _handleCaptureEvent = (
    _: Electron.IpcMainEvent,
    channel: string,
    ...args: unknown[]
  ): void => {
    if (MATRIX_RENDERER_CHANNELS.has(channel)) {
      this._sendToAppWindow(channel, ...args);
    }
  };

  _handleSaveSession = (
    _: Electron.IpcMainEvent,
    session: MatrixSessionCredentials,
  ): void => {
    if (!this._canPersistSession()) {
      this._sendToAppWindow(
        "INFO",
        "Secure credential storage is unavailable; the Matrix session will not be saved",
      );
      return;
    }

    try {
      const encryptedAccessToken = safeStorage
        .encryptString(session.accessToken)
        .toString("base64");

      this._credentialStore.set("session", {
        homeserver: session.homeserver,
        userId: session.userId,
        deviceId: session.deviceId,
        encryptedAccessToken,
      });
    } catch (error) {
      this._sendToAppWindow(
        "ERROR",
        `Unable to save Matrix credentials securely: ${String(error)}`,
      );
    }
  };

  _handleClearSession = (): void => {
    this._credentialStore.delete("session");
  };

  _handleGetLiveKitToken = async (
    _: Electron.IpcMainInvokeEvent,
    request: MatrixLiveKitTokenRequest,
  ): Promise<MatrixSfuConfig> => {
    const serviceUrl = request.serviceUrl.replace(/\/+$/, "");
    const response = await net.fetch(`${serviceUrl}/sfu/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: request.roomId,
        openid_token: request.openIdToken,
        device_id: request.deviceId,
      }),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 1000);
      throw new Error(
        `MatrixRTC authorization failed (${response.status}): ${body}`,
      );
    }

    const config = (await response.json()) as Partial<MatrixSfuConfig>;
    if (!config.url || !config.jwt) {
      throw new Error("MatrixRTC authorization returned an invalid response");
    }

    return { url: config.url, jwt: config.jwt };
  };

  _loadSession = (): MatrixSessionCredentials | undefined => {
    const stored = this._credentialStore.get("session");
    if (!stored || !this._canPersistSession()) return undefined;

    try {
      return {
        homeserver: stored.homeserver,
        userId: stored.userId,
        deviceId: stored.deviceId,
        accessToken: safeStorage.decryptString(
          Buffer.from(stored.encryptedAccessToken, "base64"),
        ),
      };
    } catch (error) {
      this._credentialStore.delete("session");
      this._sendToAppWindow(
        "ERROR",
        `Unable to restore Matrix credentials: ${String(error)}`,
      );
      return undefined;
    }
  };

  _canPersistSession = (): boolean => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform !== "linux") return true;
    return safeStorage.getSelectedStorageBackend() !== "basic_text";
  };

  _closeSsoServer = (): void => {
    if (this._ssoTimeout) {
      clearTimeout(this._ssoTimeout);
      this._ssoTimeout = undefined;
    }

    if (this._ssoServer) {
      this._ssoServer.close();
      this._ssoServer = undefined;
    }
  };

  _normalizeHomeserver(homeserver: string): string {
    return homeserver.trim().replace(/\/+$/, "");
  }
}
