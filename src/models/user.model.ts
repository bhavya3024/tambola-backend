import mongoose, { Schema, Document } from "mongoose";
import { USERNAME, DISPLAY_NAME } from "../config/constants";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  displayName: string;
  avatar?: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    totalClaims: number;
  };
  refreshToken?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: USERNAME.MIN_LENGTH,
      maxlength: USERNAME.MAX_LENGTH,
      match: new RegExp(USERNAME.PATTERN),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: DISPLAY_NAME.MAX_LENGTH,
    },
    avatar: {
      type: String,
      default: undefined,
    },
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      gamesWon: { type: Number, default: 0 },
      totalClaims: { type: Number, default: 0 },
    },
    refreshToken: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpiry: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (email and username already indexed via unique: true)

export const User = mongoose.model<IUser>("User", userSchema);
