export type MatrixLoginFlows = {
  password: boolean;
  sso: boolean;
};

export type MatrixRoomSummary = {
  id: string;
  name: string;
};

export type MatrixSessionCredentials = {
  homeserver: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

export type MatrixSessionInfo = Omit<MatrixSessionCredentials, "accessToken">;

export type MatrixLiveKitTokenRequest = {
  serviceUrl: string;
  roomId: string;
  openIdToken: unknown;
  deviceId: string;
};

export type MatrixSfuConfig = {
  url: string;
  jwt: string;
};
