import React, { useState, useEffect } from "react";

import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import Avatar from "@mui/material/Avatar";

import ExpandLess from "@mui/icons-material/ExpandLessRounded";
import ExpandMore from "@mui/icons-material/ExpandMoreRounded";

import { RootState } from "../../app/store";
import { useSelector, useDispatch } from "react-redux";
import {
  addOutput,
  isMatrixOutputId,
  matrixOutputId,
  matrixRoomIdFromOutputId,
  removeOutput,
  setGuilds,
  setMatrixReady,
  setMatrixRooms,
  setOutput,
} from "./outputSlice";

import { OutputListItem } from "./OutputListItem";

export function OutputListItems() {
  const [open, setOpen] = useState(true);

  function toggleOpen() {
    setOpen(!open);
  }

  const output = useSelector((state: RootState) => state.output);
  const settings = useSelector((state: RootState) => state.settings);
  const dispatch = useDispatch();

  useEffect(() => {
    window.kenku.on("DISCORD_GUILDS", (args) => {
      dispatch(setGuilds(args[0]));
    });
    window.kenku.on("DISCORD_CHANNEL_LEFT", (args) => {
      dispatch(removeOutput(args[0]));
    });
    window.kenku.on("DISCORD_CHANNEL_JOINED", (args) => {
      dispatch(addOutput(args[0]));
    });

    window.kenku.on("MATRIX_READY", () => {
      dispatch(setMatrixReady(true));
    });
    window.kenku.on("MATRIX_DISCONNECTED", () => {
      dispatch(setMatrixReady(false));
      dispatch(setMatrixRooms([]));
    });
    window.kenku.on("MATRIX_ROOMS", (args) => {
      dispatch(setMatrixRooms(args[0]));
    });
    window.kenku.on("MATRIX_ROOM_LEFT", (args) => {
      dispatch(removeOutput(matrixOutputId(args[0])));
    });
    window.kenku.on("MATRIX_ROOM_JOINED", (args) => {
      dispatch(addOutput(matrixOutputId(args[0])));
    });

    return () => {
      window.kenku.removeAllListeners("DISCORD_GUILDS");
      window.kenku.removeAllListeners("DISCORD_CHANNEL_LEFT");
      window.kenku.removeAllListeners("DISCORD_CHANNEL_JOINED");
      window.kenku.removeAllListeners("MATRIX_READY");
      window.kenku.removeAllListeners("MATRIX_DISCONNECTED");
      window.kenku.removeAllListeners("MATRIX_ROOMS");
      window.kenku.removeAllListeners("MATRIX_ROOM_LEFT");
      window.kenku.removeAllListeners("MATRIX_ROOM_JOINED");
    };
  }, [dispatch]);

  function leaveOutput(id: string) {
    if (id === "local") {
      window.kenku.setLoopback(false);
    } else if (isMatrixOutputId(id)) {
      window.kenku.matrixLeaveRoom(matrixRoomIdFromOutputId(id));
    } else {
      window.kenku.leaveChannel(id);
    }
  }

  function joinOutput(id: string) {
    if (id === "local") {
      window.kenku.setLoopback(true);
    } else if (isMatrixOutputId(id)) {
      window.kenku.matrixJoinRoom(matrixRoomIdFromOutputId(id));
    } else {
      window.kenku.joinChannel(id);
    }
  }

  function findDiscordGuildChannel(channelId: string): string | undefined {
    const channelsToGuild: Record<string, string> = {};
    for (const guild of output.guilds) {
      for (const channel of guild.voiceChannels) {
        channelsToGuild[channel.id] = guild.id;
      }
    }

    const targetGuild = channelsToGuild[channelId];
    if (!targetGuild) return undefined;

    return output.outputs.find(
      (id) => id !== channelId && channelsToGuild[id] === targetGuild,
    );
  }

  function handleChannelChange(channelId: string) {
    if (settings.multipleOutputsEnabled) {
      if (output.outputs.includes(channelId)) {
        dispatch(removeOutput(channelId));
        leaveOutput(channelId);
        return;
      }

      // MatrixRTC currently publishes one Kenku track to one Matrix room at a
      // time. Matrix can still be combined with Discord and local playback.
      if (isMatrixOutputId(channelId)) {
        const currentMatrixOutput = output.outputs.find(isMatrixOutputId);
        if (currentMatrixOutput) {
          dispatch(removeOutput(currentMatrixOutput));
          leaveOutput(currentMatrixOutput);
        }
      } else if (channelId !== "local") {
        // Discord only allows one voice channel per guild.
        const guildChannel = findDiscordGuildChannel(channelId);
        if (guildChannel) {
          dispatch(removeOutput(guildChannel));
          leaveOutput(guildChannel);
        }
      }

      dispatch(addOutput(channelId));
      joinOutput(channelId);
      return;
    }

    const previousOutput = output.outputs[0];
    if (previousOutput === channelId) return;

    if (previousOutput) {
      leaveOutput(previousOutput);
    }

    dispatch(setOutput(channelId));
    joinOutput(channelId);
  }

  return (
    <>
      <ListItemButton onClick={toggleOpen}>
        <ListItemText
          primary={settings.multipleOutputsEnabled ? "Outputs" : "Output"}
        />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          <OutputListItem
            voiceChannel={{ id: "local", name: "This Computer" }}
            selected={output.outputs.includes("local")}
            tick={
              settings.multipleOutputsEnabled &&
              output.outputs.includes("local")
            }
            onClick={handleChannelChange}
          />
          <Divider variant="middle" />

          {output.guilds.map((guild) => (
            <List key={guild.id} sx={{ py: 0 }}>
              <ListItem alignItems="center">
                <ListItemAvatar
                  sx={{ minWidth: "36px", marginTop: 0, marginLeft: "8px" }}
                >
                  <Avatar
                    sx={{ width: "24px", height: "24px" }}
                    alt={guild.name}
                    src={guild.icon}
                  />
                </ListItemAvatar>
                <ListItemText
                  sx={{
                    backgroundColor: "inherit",
                    color: "rgba(255, 255, 255, 0.7)",
                    padding: 0,
                  }}
                  primaryTypographyProps={{ sx: { fontSize: "0.875rem" } }}
                >
                  {guild.name}
                </ListItemText>
              </ListItem>
              {guild.voiceChannels.map((channel) => (
                <OutputListItem
                  voiceChannel={channel}
                  selected={output.outputs.includes(channel.id)}
                  tick={
                    settings.multipleOutputsEnabled &&
                    output.outputs.includes(channel.id)
                  }
                  onClick={handleChannelChange}
                  key={channel.id}
                />
              ))}
            </List>
          ))}

          {output.matrixReady && (
            <List sx={{ py: 0 }}>
              <ListItem alignItems="center">
                <ListItemAvatar
                  sx={{ minWidth: "36px", marginTop: 0, marginLeft: "8px" }}
                >
                  <Avatar sx={{ width: "24px", height: "24px" }}>M</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="Matrix"
                  secondary="Only rooms with active calls are shown"
                  primaryTypographyProps={{ sx: { fontSize: "0.875rem" } }}
                  secondaryTypographyProps={{ sx: { fontSize: "0.7rem" } }}
                />
              </ListItem>

              {output.matrixRooms.length === 0 && (
                <ListItem sx={{ pl: 6 }}>
                  <ListItemText
                    secondary="No active calls"
                    secondaryTypographyProps={{ sx: { fontSize: "0.75rem" } }}
                  />
                </ListItem>
              )}

              {output.matrixRooms.map((room) => {
                const id = matrixOutputId(room.id);
                return (
                  <OutputListItem
                    voiceChannel={{ id, name: room.name }}
                    selected={output.outputs.includes(id)}
                    tick={
                      settings.multipleOutputsEnabled &&
                      output.outputs.includes(id)
                    }
                    onClick={handleChannelChange}
                    key={room.id}
                  />
                );
              })}
            </List>
          )}
        </List>
      </Collapse>
    </>
  );
}
