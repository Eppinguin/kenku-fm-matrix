import { ipcRenderer } from "electron";

import { AudioCaptureManagerPreload } from "../preload/managers/AudioCaptureManagerPreload";
import { MatrixBroadcastPreload } from "../preload/managers/MatrixBroadcastPreload";

const audioCaptureManager = new AudioCaptureManagerPreload();
const matrixBroadcast = new MatrixBroadcastPreload(() =>
  audioCaptureManager.getOutputTrack(),
);

ipcRenderer.on(
  "AUDIO_CAPTURE_START_BROWSER_VIEW_STREAM",
  (_, viewId: number, mediaSourceId: string) => {
    audioCaptureManager.startBrowserViewStream(viewId, mediaSourceId);
  },
);

ipcRenderer.on(
  "AUDIO_CAPTURE_STOP_BROWSER_VIEW_STREAM",
  (_, viewId: number) => {
    audioCaptureManager.stopBrowserViewStream(viewId);
  },
);

ipcRenderer.on(
  "AUDIO_CAPTURE_BROWSER_VIEW_MUTED",
  (_, viewId: number, muted: boolean) => {
    audioCaptureManager.setMuted(viewId, muted);
  },
);

ipcRenderer.on("AUDIO_CAPTURE_SET_LOOPBACK", (_, loopback: boolean) => {
  audioCaptureManager.setLoopback(loopback);
});

ipcRenderer.on(
  "AUDIO_CAPTURE_START_EXTERNAL_AUDIO_CAPTURE",
  (_, deviceId: string) => {
    audioCaptureManager.startExternalAudioCapture(deviceId);
  },
);

ipcRenderer.on(
  "AUDIO_CAPTURE_STOP_EXTERNAL_AUDIO_CAPTURE",
  (_, deviceId: string) => {
    audioCaptureManager.stopExternalAudioCapture(deviceId);
  },
);

ipcRenderer.on(
  "AUDIO_CAPTURE_START",
  (_, streamingMode: "lowLatency" | "performance") => {
    void audioCaptureManager.start(streamingMode);
  },
);

ipcRenderer.on("MATRIX_GET_LOGIN_FLOWS", (_, homeserver: string) => {
  void matrixBroadcast.getLoginFlows(homeserver);
});

ipcRenderer.on(
  "MATRIX_LOGIN_PASSWORD",
  (_, homeserver: string, username: string, password: string) => {
    void matrixBroadcast.loginPassword(homeserver, username, password);
  },
);

ipcRenderer.on(
  "MATRIX_LOGIN_SSO_TOKEN",
  (_, homeserver: string, loginToken: string) => {
    void matrixBroadcast.loginSsoToken(homeserver, loginToken);
  },
);

ipcRenderer.on(
  "MATRIX_LOGIN_TOKEN",
  (_, homeserver: string, accessToken: string) => {
    void matrixBroadcast.loginAccessToken(homeserver, accessToken);
  },
);

ipcRenderer.on("MATRIX_CONNECT_SESSION", (_, session) => {
  void matrixBroadcast.restoreSession(session);
});

ipcRenderer.on("MATRIX_LOGOUT", () => {
  void matrixBroadcast.logout();
});

ipcRenderer.on("MATRIX_DISCONNECT", () => {
  void matrixBroadcast.disconnect();
});

ipcRenderer.on("MATRIX_JOIN_ROOM", (_, roomId: string) => {
  void matrixBroadcast.joinRoom(roomId);
});

ipcRenderer.on("MATRIX_LEAVE_ROOM", (_, roomId: string) => {
  void matrixBroadcast.leaveRoom(roomId);
});
