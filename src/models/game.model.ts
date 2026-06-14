import mongoose, { Schema, Document, Types } from "mongoose";
import {
  PLAYERS,
  TICKETS_PER_PLAYER,
  NUMBER_CALL_INTERVAL,
  GAME_STATUS,
  ALL_GAME_STATUSES,
  WIN_PATTERN,
  ALL_PATTERNS,
} from "../config/constants";

export type GameStatus = typeof GAME_STATUS[keyof typeof GAME_STATUS];

export type WinPattern = typeof WIN_PATTERN[keyof typeof WIN_PATTERN];

// Re-export ALL_PATTERNS for convenience to consumers who import from model
export { ALL_PATTERNS };

export interface IGamePlayer {
  user: Types.ObjectId;
  joinedAt: Date;
}

export interface IGame extends Document {
  code: string;
  host: Types.ObjectId;
  status: GameStatus;
  maxPlayers: number;
  ticketsPerPlayer: number;
  players: IGamePlayer[];
  calledNumbers: number[];
  currentNumber?: number;
  numberCallInterval: number;
  winners: Partial<Record<WinPattern, Types.ObjectId>>;
  availablePatterns: WinPattern[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema = new Schema<IGame>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      length: 6,
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ALL_GAME_STATUSES,
      default: GAME_STATUS.WAITING,
    },
    maxPlayers: {
      type: Number,
      default: PLAYERS.DEFAULT,
      min: PLAYERS.MIN,
      max: PLAYERS.MAX,
    },
    ticketsPerPlayer: {
      type: Number,
      default: TICKETS_PER_PLAYER.DEFAULT,
      min: TICKETS_PER_PLAYER.MIN,
      max: TICKETS_PER_PLAYER.MAX,
    },
    players: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    calledNumbers: {
      type: [Number],
      default: [],
    },
    currentNumber: {
      type: Number,
      default: undefined,
    },
    numberCallInterval: {
      type: Number,
      default: NUMBER_CALL_INTERVAL.DEFAULT,
      min: NUMBER_CALL_INTERVAL.MIN,
      max: NUMBER_CALL_INTERVAL.MAX,
    },
    winners: {
      earlyFive: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
      topLine: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
      middleLine: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
      bottomLine: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
      fullHouse: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    },
    availablePatterns: {
      type: [String],
      enum: ALL_PATTERNS,
      default: ALL_PATTERNS,
    },
    startedAt: { type: Date, default: undefined },
    completedAt: { type: Date, default: undefined },
  },
  {
    timestamps: true,
  }
);

// Indexes (code already indexed via unique: true)
gameSchema.index({ status: 1 });
gameSchema.index({ host: 1 });

export const Game = mongoose.model<IGame>("Game", gameSchema);
