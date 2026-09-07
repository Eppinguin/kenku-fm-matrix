import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type VoiceChannel = {
  id: string;
  name: string;
};

export type Guild = {
  id: string;
  name: string;
  icon: string;
  voiceChannels: VoiceChannel[];
};

export type MatrixRoom = {
  id: string;
  name: string;
};

export const MATRIX_OUTPUT_PREFIX = "matrix:";

export function matrixOutputId(roomId: string): string {
  return `${MATRIX_OUTPUT_PREFIX}${roomId}`;
}

export function isMatrixOutputId(outputId: string): boolean {
  return outputId.startsWith(MATRIX_OUTPUT_PREFIX);
}

export function matrixRoomIdFromOutputId(outputId: string): string {
  return outputId.slice(MATRIX_OUTPUT_PREFIX.length);
}

export interface OutputState {
  guilds: Guild[];
  matrixReady: boolean;
  matrixRooms: MatrixRoom[];
  outputs: string[];
}

const initialState: OutputState = {
  guilds: [],
  matrixReady: false,
  matrixRooms: [],
  outputs: ["local"],
};

export const outputSlice = createSlice({
  name: "output",
  initialState,
  reducers: {
    setGuilds: (state, action: PayloadAction<Guild[]>) => {
      state.guilds = action.payload;
    },
    setMatrixReady: (state, action: PayloadAction<boolean>) => {
      state.matrixReady = action.payload;
    },
    setMatrixRooms: (state, action: PayloadAction<MatrixRoom[]>) => {
      state.matrixRooms = action.payload;
    },
    setOutput: (state, action: PayloadAction<string>) => {
      state.outputs = [action.payload];
    },
    addOutput: (state, action: PayloadAction<string>) => {
      if (state.outputs.includes(action.payload)) {
        return;
      }
      state.outputs.push(action.payload);
    },
    removeOutput: (state, action: PayloadAction<string>) => {
      state.outputs = state.outputs.filter(
        (channel) => channel !== action.payload,
      );
    },
  },
});

export const {
  setGuilds,
  setMatrixReady,
  setMatrixRooms,
  setOutput,
  addOutput,
  removeOutput,
} = outputSlice.actions;

export default outputSlice.reducer;
