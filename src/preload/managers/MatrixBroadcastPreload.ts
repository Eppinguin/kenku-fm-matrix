import { ipcRenderer } from "electron";

// MatrixClient.initRustCrypto() loads this module with import(). Kenku's
// Electron preload cannot fetch renderer chunks, so the renderer Webpack config
// bundles dynamic imports eagerly and aliases the WASM loader used below.
import "matrix-js-sdk/lib/rust-crypto/index.js";
import { Room as LiveKitRoom, Track } from "livekit-client";
import {
  ClientEvent,
  createClient,
  type IOpenIDToken,
  type MatrixClient,
} from "matrix-js-sdk";
import {
  isLivekitTransportConfig,
  type LivekitTransportConfig,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";

import type {
  MatrixLoginFlows,
  MatrixRoomSummary,
  MatrixSessionCredentials,
  MatrixSessionInfo,
  MatrixSfuConfig,
} from "../../matrix/types";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - worker-loader turns this module into a Worker constructor.
import LiveKitE2EEWorker from "../../audioCapture/LiveKitE2EE.worker.js";
import { MatrixMediaKeyProvider } from "../../audioCapture/MatrixMediaKeyProvider.js";

type MatrixLoginResponse = {
  access_token?: string;
  user_id?: string;
  device_id?: string;
};

/**
 * Publishes Kenku's mixed Web Audio track into an existing MatrixRTC call.
 * Matrix handles call membership/key exchange; LiveKit carries the media.
 */
export class MatrixBroadcastPreload {
  _client?: MatrixClient;
  _keyProvider?: MatrixMediaKeyProvider;
  _livekitRoom?: LiveKitRoom;
  _rtcSession?: MatrixRTCSession;
  _publishedTrack?: MediaStreamTrack;
  _joinedRoomId?: string;

  constructor(private readonly getOutputTrack: () => MediaStreamTrack) {}

  async getLoginFlows(homeserver: string): Promise<void> {
    const baseUrl = this._normalizeHomeserver(homeserver);
    if (!baseUrl) {
      this._reply("ERROR", "Matrix homeserver is required");
      return;
    }

    try {
      const client = createClient({ baseUrl });
      const response = await client.loginFlows();
      const types = response.flows.map((flow) => flow.type);
      const flows: MatrixLoginFlows = {
        password: types.includes("m.login.password"),
        sso:
          types.includes("m.login.sso") ||
          types.includes("org.matrix.login.sso"),
      };
      this._reply("MATRIX_LOGIN_FLOWS", flows);
    } catch (error) {
      this._reply("MATRIX_LOGIN_FLOWS", { password: false, sso: false });
      this._reply(
        "ERROR",
        `Unable to discover Matrix login methods: ${this._errorMessage(error)}`,
      );
    }
  }

  async loginPassword(
    homeserver: string,
    username: string,
    password: string,
  ): Promise<void> {
    const baseUrl = this._normalizeHomeserver(homeserver);
    if (!baseUrl || !username.trim() || !password) {
      this._reply("MATRIX_DISCONNECTED");
      this._reply("ERROR", "Homeserver, username, and password are required");
      return;
    }

    try {
      const temporaryClient = createClient({ baseUrl });
      const response = (await temporaryClient.loginRequest({
        type: "m.login.password",
        identifier: {
          type: "m.id.user",
          user: username.trim(),
        },
        password,
        initial_device_display_name: "Kenku FM",
      })) as MatrixLoginResponse;

      await this._finishLogin(baseUrl, response, true);
    } catch (error) {
      await this.disconnect(false);
      this._reply("MATRIX_DISCONNECTED");
      this._reply("ERROR", `Matrix sign-in failed: ${this._errorMessage(error)}`);
    }
  }

  async loginSsoToken(homeserver: string, loginToken: string): Promise<void> {
    const baseUrl = this._normalizeHomeserver(homeserver);
    if (!baseUrl || !loginToken) {
      this._reply("MATRIX_DISCONNECTED");
      this._reply("ERROR", "Invalid Matrix SSO callback");
      return;
    }

    try {
      const temporaryClient = createClient({ baseUrl });
      const response = (await temporaryClient.loginRequest({
        type: "m.login.token",
        token: loginToken,
        initial_device_display_name: "Kenku FM",
      })) as MatrixLoginResponse;

      await this._finishLogin(baseUrl, response, true);
    } catch (error) {
      await this.disconnect(false);
      this._reply("MATRIX_DISCONNECTED");
      this._reply(
        "ERROR",
        `Matrix SSO sign-in failed: ${this._errorMessage(error)}`,
      );
    }
  }

  async loginAccessToken(
    homeserver: string,
    accessToken: string,
  ): Promise<void> {
    const baseUrl = this._normalizeHomeserver(homeserver);
    const token = accessToken.trim();
    if (!baseUrl || !token) {
      this._reply("MATRIX_DISCONNECTED");
      this._reply("ERROR", "Matrix homeserver and access token are required");
      return;
    }

    try {
      const bootstrap = createClient({ baseUrl, accessToken: token });
      const whoami = await bootstrap.whoami();
      if (!whoami.user_id || !whoami.device_id) {
        throw new Error(
          "The Matrix access token is not associated with a device ID",
        );
      }

      await this._connectSession(
        {
          homeserver: baseUrl,
          accessToken: token,
          userId: whoami.user_id,
          deviceId: whoami.device_id,
        },
        true,
      );
    } catch (error) {
      await this.disconnect(false);
      this._reply("MATRIX_DISCONNECTED");
      this._reply(
        "ERROR",
        `Matrix access-token sign-in failed: ${this._errorMessage(error)}`,
      );
    }
  }

  async restoreSession(session: MatrixSessionCredentials): Promise<void> {
    try {
      await this._connectSession(session, false);
    } catch (error) {
      await this.disconnect(false);
      this._reply("MATRIX_DISCONNECTED");
      this._reply(
        "ERROR",
        `Unable to restore Matrix session: ${this._errorMessage(error)}`,
      );
    }
  }

  async logout(): Promise<void> {
    const previousRoomId = this._joinedRoomId;
    const client = this._client;

    if (client) {
      try {
        await client.logout(true);
      } catch (error) {
        console.error(error);
        this._reply(
          "INFO",
          `Matrix server logout failed; local credentials were still removed: ${this._errorMessage(error)}`,
        );
      }
    }

    await this.disconnect(false);
    ipcRenderer.send("MATRIX_CLEAR_SESSION");
    if (previousRoomId) this._reply("MATRIX_ROOM_LEFT", previousRoomId);
    this._reply("MATRIX_ROOMS", []);
    this._reply("MATRIX_DISCONNECTED");
  }

  async disconnect(notify = true): Promise<void> {
    const previousRoomId = this._joinedRoomId;
    await this.leaveRoom(undefined, false);

    if (this._client) {
      try {
        this._client.off(ClientEvent.Sync, this._handleSync);
        this._client.stopClient();
      } catch (error) {
        console.error(error);
      }
    }

    this._client = undefined;

    if (notify) {
      if (previousRoomId) this._reply("MATRIX_ROOM_LEFT", previousRoomId);
      this._reply("MATRIX_ROOMS", []);
      this._reply("MATRIX_DISCONNECTED");
    }
  }

  async joinRoom(roomId: string): Promise<void> {
    const client = this._client;
    if (!client) {
      this._reply("ERROR", "Sign in to Matrix before selecting a Matrix output");
      return;
    }
    if (this._joinedRoomId === roomId) return;

    try {
      await this.leaveRoom(undefined, false);

      const room = client.getRoom(roomId);
      if (!room || room.getMyMembership() !== "join") {
        throw new Error(`Matrix room is not joined: ${roomId}`);
      }

      const rtcSession = client.matrixRTC.getRoomSession(room);
      await rtcSession.initialMembershipCalculated;
      if (rtcSession.memberships.length === 0) {
        throw new Error("This room does not currently have an active Matrix call");
      }

      const transport = await this._discoverLiveKitTransport(client, rtcSession);
      const keyProvider = new MatrixMediaKeyProvider();
      keyProvider.setSession(rtcSession);

      this._keyProvider = keyProvider;
      this._rtcSession = rtcSession;

      rtcSession.joinRoomSession([transport], undefined, {
        manageMediaKeys: true,
        keyRotationGracePeriodMs: 5000,
        useKeyDelay: 3000,
      });

      const openIdToken = await client.getOpenIdToken();
      const deviceId = client.getDeviceId();
      if (!deviceId) throw new Error("Matrix device ID is unavailable");

      const sfu = await this._getLiveKitToken(
        transport.livekit_service_url,
        roomId,
        openIdToken,
        deviceId,
      );

      this._livekitRoom = new LiveKitRoom({
        adaptiveStream: false,
        dynacast: false,
        stopLocalTrackOnUnpublish: false,
        encryption: {
          keyProvider,
          worker: new LiveKitE2EEWorker(),
        },
      });

      await this._livekitRoom.connect(sfu.url, sfu.jwt, {
        autoSubscribe: false,
      });

      this._publishedTrack = this.getOutputTrack().clone();
      await this._livekitRoom.localParticipant.publishTrack(
        this._publishedTrack,
        {
          name: "Kenku FM",
          source: Track.Source.Microphone,
          dtx: false,
          red: true,
        },
      );

      this._joinedRoomId = roomId;
      this._reply("MATRIX_ROOM_JOINED", roomId);
      this._reply("MESSAGE", `Joined Matrix call: ${room.name || roomId}`);
      void this._sendRooms();
    } catch (error) {
      console.error(error);
      await this.leaveRoom(roomId, false);
      this._reply("MATRIX_ROOM_LEFT", roomId);
      this._reply(
        "ERROR",
        `Unable to join Matrix call: ${this._errorMessage(error)}`,
      );
    }
  }

  async leaveRoom(roomId?: string, notify = true): Promise<void> {
    const previousRoomId = this._joinedRoomId ?? roomId;

    if (this._livekitRoom) {
      try {
        await this._livekitRoom.disconnect();
      } catch (error) {
        console.error(error);
      }
      this._livekitRoom = undefined;
    }

    if (this._publishedTrack) {
      this._publishedTrack.stop();
      this._publishedTrack = undefined;
    }

    if (this._rtcSession) {
      try {
        await this._rtcSession.leaveRoomSession(5000);
      } catch (error) {
        console.error(error);
      }
      this._rtcSession = undefined;
    }

    this._keyProvider?.clearSession();
    this._keyProvider = undefined;
    this._joinedRoomId = undefined;

    if (notify && previousRoomId) {
      this._reply("MATRIX_ROOM_LEFT", previousRoomId);
      void this._sendRooms();
    }
  }

  async _finishLogin(
    homeserver: string,
    response: MatrixLoginResponse,
    persist: boolean,
  ): Promise<void> {
    if (!response.access_token || !response.user_id || !response.device_id) {
      throw new Error("Matrix login response did not include device credentials");
    }

    const credentials: MatrixSessionCredentials = {
      homeserver,
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
    };

    try {
      await this._connectSession(credentials, persist);
    } catch (error) {
      // Password/SSO login has created a new device already. Revoke it if
      // crypto/session bootstrap fails so failed attempts do not leave orphaned
      // "Kenku FM" devices on the account.
      try {
        const cleanupClient = createClient({
          baseUrl: homeserver,
          accessToken: credentials.accessToken,
          userId: credentials.userId,
          deviceId: credentials.deviceId,
        });
        await cleanupClient.logout(true);
      } catch (cleanupError) {
        console.error("Unable to revoke failed Matrix login device", cleanupError);
      }
      throw error;
    }
  }

  async _connectSession(
    credentials: MatrixSessionCredentials,
    persist: boolean,
  ): Promise<void> {
    await this.disconnect(false);

    const normalized: MatrixSessionCredentials = {
      ...credentials,
      homeserver: this._normalizeHomeserver(credentials.homeserver),
      accessToken: credentials.accessToken.trim(),
    };
    if (
      !normalized.homeserver ||
      !normalized.accessToken ||
      !normalized.userId ||
      !normalized.deviceId
    ) {
      throw new Error("Incomplete Matrix session credentials");
    }

    const client = createClient({
      baseUrl: normalized.homeserver,
      accessToken: normalized.accessToken,
      userId: normalized.userId,
      deviceId: normalized.deviceId,
      useLivekitForGroupCalls: true,
      isVoipWithNoMediaAllowed: true,
    });
    this._client = client;

    const cryptoDbSuffix = `${normalized.userId}-${normalized.deviceId}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );
    await client.initRustCrypto({
      cryptoDatabasePrefix: `kenku-fm-matrix-rtc-${cryptoDbSuffix}-`,
    });

    await this._waitForInitialSync(client);
    client.on(ClientEvent.Sync, this._handleSync);

    // MatrixRTCSession calculates its initial membership list asynchronously.
    // Waiting here makes calls which predate Kenku startup visible immediately.
    await this._sendRooms();

    if (persist) {
      ipcRenderer.send("MATRIX_SAVE_SESSION", normalized);
    }

    const sessionInfo: MatrixSessionInfo = {
      homeserver: normalized.homeserver,
      userId: normalized.userId,
      deviceId: normalized.deviceId,
    };
    this._reply("MATRIX_READY", sessionInfo);
  }

  _waitForInitialSync(client: MatrixClient): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.off(ClientEvent.Sync, onSync);
        reject(new Error("Timed out waiting for Matrix initial sync"));
      }, 30000);

      const onSync = (state: string): void => {
        if (state === "PREPARED" || state === "SYNCING") {
          clearTimeout(timeout);
          client.off(ClientEvent.Sync, onSync);
          resolve();
        } else if (state === "ERROR") {
          clearTimeout(timeout);
          client.off(ClientEvent.Sync, onSync);
          reject(new Error("Matrix initial sync failed"));
        }
      };

      client.on(ClientEvent.Sync, onSync);
      void client.startClient({ initialSyncLimit: 20 }).catch((error) => {
        clearTimeout(timeout);
        client.off(ClientEvent.Sync, onSync);
        reject(error);
      });
    });
  }

  async _discoverLiveKitTransport(
    client: MatrixClient,
    rtcSession: MatrixRTCSession,
  ): Promise<LivekitTransportConfig> {
    const oldestMembership = rtcSession.getOldestMembership();
    if (oldestMembership) {
      const selected = oldestMembership.getTransport(oldestMembership);
      if (selected && isLivekitTransportConfig(selected)) {
        return this._normalizeTransport(selected);
      }

      for (const membership of rtcSession.memberships) {
        const advertised = membership.transports.find(isLivekitTransportConfig);
        if (advertised) return this._normalizeTransport(advertised);
      }
    }

    try {
      const transports = await client._unstable_getRTCTransports();
      const discovered = transports.find(isLivekitTransportConfig);
      if (discovered) return this._normalizeTransport(discovered);
    } catch (error) {
      console.info(
        "MatrixRTC transports endpoint unavailable; trying .well-known fallback",
        error,
      );
    }

    await client.waitForClientWellKnown();
    const legacyServiceUrl = client.getLivekitServiceURL();
    if (legacyServiceUrl) {
      return {
        type: "livekit",
        livekit_service_url: legacyServiceUrl.replace(/\/+$/, ""),
      };
    }

    throw new Error(
      "The active Matrix call does not advertise a usable LiveKit transport",
    );
  }

  _normalizeTransport(
    transport: LivekitTransportConfig,
  ): LivekitTransportConfig {
    return {
      ...transport,
      livekit_service_url: transport.livekit_service_url.replace(/\/+$/, ""),
    };
  }

  _getLiveKitToken(
    serviceUrl: string,
    roomId: string,
    openIdToken: IOpenIDToken,
    deviceId: string,
  ): Promise<MatrixSfuConfig> {
    return ipcRenderer.invoke("MATRIX_GET_LIVEKIT_TOKEN", {
      serviceUrl,
      roomId,
      openIdToken,
      deviceId,
    });
  }

  _handleSync = (state: string): void => {
    if (state === "SYNCING" || state === "PREPARED") {
      void this._sendRooms();
    }
  };

  async _sendRooms(): Promise<void> {
    const client = this._client;
    if (!client) return;

    const sessions = await Promise.all(
      client
        .getRooms()
        .filter((room) => room.getMyMembership() === "join")
        .map(async (room) => {
          const session = client.matrixRTC.getRoomSession(room);
          try {
            await session.initialMembershipCalculated;
          } catch (error) {
            console.error(
              `Unable to calculate initial MatrixRTC members for ${room.roomId}`,
              error,
            );
          }
          return { room, session };
        }),
    );

    // Ignore a stale refresh if the account changed while calculations ran.
    if (this._client !== client) return;

    const rooms: MatrixRoomSummary[] = sessions
      .filter(({ session }) => session.memberships.length > 0)
      .map(({ room }) => ({
        id: room.roomId,
        name: room.name || room.getCanonicalAlias() || room.roomId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this._reply("MATRIX_ROOMS", rooms);
  }

  _normalizeHomeserver(homeserver: string): string {
    return homeserver.trim().replace(/\/+$/, "");
  }

  _reply(channel: string, ...args: unknown[]): void {
    ipcRenderer.send("MATRIX_CAPTURE_EVENT", channel, ...args);
  }

  _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
