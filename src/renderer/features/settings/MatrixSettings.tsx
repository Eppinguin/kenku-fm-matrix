// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { setMatrixHomeserver, setMatrixUsername } from "./settingsSlice";

type MatrixLoginFlows = {
  password: boolean;
  sso: boolean;
};

type MatrixSessionInfo = {
  homeserver: string;
  userId: string;
  deviceId: string;
};

type MatrixStatus = "disconnected" | "connecting" | "ready";

export function MatrixSettings() {
  const settings = useSelector((state: RootState) => state.settings);
  const dispatch = useDispatch();

  const [status, setStatus] = useState<MatrixStatus>("disconnected");
  const [session, setSession] = useState<MatrixSessionInfo>();
  const [loginFlows, setLoginFlows] = useState<MatrixLoginFlows>();
  const [discovering, setDiscovering] = useState(false);
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    window.kenku.on("MATRIX_LOGIN_FLOWS", (args) => {
      setDiscovering(false);
      setLoginFlows(args[0] as MatrixLoginFlows);
    });
    window.kenku.on("MATRIX_READY", (args) => {
      setStatus("ready");
      setPassword("");
      setAccessToken("");
      setSession(args[0] as MatrixSessionInfo);
    });
    window.kenku.on("MATRIX_DISCONNECTED", () => {
      setStatus("disconnected");
      setSession(undefined);
    });

    window.kenku.matrixRestoreSession();

    return () => {
      window.kenku.removeAllListeners("MATRIX_LOGIN_FLOWS");
      window.kenku.removeAllListeners("MATRIX_READY");
      window.kenku.removeAllListeners("MATRIX_DISCONNECTED");
    };
  }, []);

  function handleHomeserverChange(event: React.ChangeEvent<HTMLInputElement>) {
    dispatch(setMatrixHomeserver(event.target.value));
    setLoginFlows(undefined);
  }

  function handleUsernameChange(event: React.ChangeEvent<HTMLInputElement>) {
    dispatch(setMatrixUsername(event.target.value));
  }

  function handleDiscoverLoginFlows() {
    if (!settings.matrixHomeserver.trim()) return;
    setDiscovering(true);
    setLoginFlows(undefined);
    window.kenku.matrixGetLoginFlows(settings.matrixHomeserver);
  }

  function handlePasswordLogin() {
    setStatus("connecting");
    window.kenku.matrixLoginPassword(
      settings.matrixHomeserver,
      settings.matrixUsername,
      password,
    );
  }

  function handleSsoLogin() {
    setStatus("connecting");
    window.kenku.matrixLoginSSO(settings.matrixHomeserver);
  }

  function handleAccessTokenLogin() {
    setStatus("connecting");
    window.kenku.matrixLoginToken(settings.matrixHomeserver, accessToken);
  }

  function handleLogout() {
    setStatus("connecting");
    window.kenku.matrixLogout();
  }

  if (status === "ready" && session) {
    return (
      <Stack spacing={1}>
        <Typography variant="body2">Signed in as {session.userId}</Typography>
        <Typography variant="caption" color="text.secondary">
          Only rooms with at least one participant already in a Matrix call
          appear under Output. Kenku joins an existing call; it does not start
          one.
        </Typography>
        <Button onClick={handleLogout} variant="outlined" size="small">
          Sign out
        </Button>
      </Stack>
    );
  }

  const busy = status === "connecting" || discovering;

  return (
    <Stack spacing={1}>
      <TextField
        margin="dense"
        size="small"
        label="Homeserver"
        placeholder="https://matrix.example.org"
        fullWidth
        variant="standard"
        autoComplete="url"
        value={settings.matrixHomeserver}
        onChange={handleHomeserverChange}
        disabled={status === "connecting"}
      />

      {!loginFlows && (
        <Button
          onClick={handleDiscoverLoginFlows}
          disabled={busy || !settings.matrixHomeserver.trim()}
          fullWidth
          variant="outlined"
          size="small"
        >
          {discovering ? <CircularProgress size={24} /> : "Continue"}
        </Button>
      )}

      {loginFlows?.password && (
        <>
          <TextField
            margin="dense"
            size="small"
            label="Username"
            fullWidth
            variant="standard"
            autoComplete="username"
            value={settings.matrixUsername}
            onChange={handleUsernameChange}
            disabled={status === "connecting"}
          />
          <TextField
            margin="dense"
            size="small"
            label="Password"
            type="password"
            fullWidth
            variant="standard"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={status === "connecting"}
            helperText="Your password is used only to sign in and is not stored."
          />
          <Button
            onClick={handlePasswordLogin}
            disabled={
              status === "connecting" ||
              !settings.matrixUsername.trim() ||
              !password
            }
            fullWidth
            variant="outlined"
            size="small"
          >
            {status === "connecting" ? (
              <CircularProgress size={24} />
            ) : (
              "Sign in"
            )}
          </Button>
        </>
      )}

      {loginFlows?.sso && (
        <Button
          onClick={handleSsoLogin}
          disabled={status === "connecting"}
          fullWidth
          variant="outlined"
          size="small"
        >
          Sign in with SSO
        </Button>
      )}

      {loginFlows && !loginFlows.password && !loginFlows.sso && (
        <Typography variant="caption" color="text.secondary">
          This homeserver did not advertise password or SSO login. You can use
          an access token under Advanced.
        </Typography>
      )}

      {loginFlows && (
        <>
          <Button
            onClick={() => setAdvancedOpen((open) => !open)}
            size="small"
          >
            {advancedOpen ? "Hide advanced" : "Advanced"}
          </Button>
          <Collapse in={advancedOpen}>
            <Stack spacing={1}>
              <TextField
                margin="dense"
                size="small"
                label="Access token"
                type="password"
                fullWidth
                variant="standard"
                autoComplete="off"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                disabled={status === "connecting"}
              />
              <Button
                onClick={handleAccessTokenLogin}
                disabled={status === "connecting" || !accessToken.trim()}
                fullWidth
                variant="outlined"
                size="small"
              >
                Sign in with access token
              </Button>
            </Stack>
          </Collapse>
        </>
      )}
    </Stack>
  );
}
