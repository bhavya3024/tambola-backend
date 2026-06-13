import mongoose, { Schema, Document, Types } from "mongoose";

export type GameStatus = "waiting" | "in_progress" | "paused" | "completed";

export type WinPattern =
  | "earlyFive"
  | "topLine"
  | "middleLine"
  | "bottomLine"
  | "fullHouse";

export const ALL_PATTERNS: WinPattern[] = [
  "earlyFive",
  "topLine",
  "middleLine",
  "bottomLine",
  "fullHouse",
];

export interface IGamePlayer {
  user: Types.ObjectId;
  joinedAt: Date;
}

export interface IGame extends Document {
  code: string;
  host: Types.ObjectId;
  status: GameStatus;
  maxPlayers: number;
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
      enum: ["waiting", "in_progress", "paused", "completed"],
      default: "waiting",
    },
    maxPlayers: {
      type: Number,
      default: 50,
      min: 2,
      max: 200,
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
      default: 10, // seconds
      min: 3,
      max: 30,
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
      enum: ["earlyFive", "topLine", "middleLine", "bottomLine", "fullHouse"],
      default: ["earlyFive", "topLine", "middleLine", "bottomLine", "fullHouse"],
    },
    startedAt: { type: Date, default: undefined },
    completedAt: { type: Date, default: undefined },
  },
  {
    timestamps: true,
  }
);

// Indexes
gameSchema.index({ code: 1 });
gameSchema.index({ status: 1 });
gameSchema.index({ host: 1 });

export const Game = mongoose.model<IGame>("Game", gameSchema);
