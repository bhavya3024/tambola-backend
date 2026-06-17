/**
 * Environment configuration — loads and validates env vars.
 * Bun auto-loads .env files, so we just read from process.env.
 */

import {
  DEFAULT_PORT,
  DEFAULT_MONGODB_URI,
  DEFAULT_JWT_EXPIRY,
  DEFAULT_REFRESH_EXPIRY,
  DEFAULT_FRONTEND_URL,
  DEFAULT_EMAIL_FROM,
} from "./constants";

export const env = {
  PORT: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
  MONGODB_URI: process.env.MONGODB_URI || DEFAULT_MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || "tambola-super-secret-key-change-in-production",
  JWT_EXPIRY: process.env.JWT_EXPIRY || DEFAULT_JWT_EXPIRY,
  REFRESH_SECRET: process.env.REFRESH_SECRET || "tambola-refresh-secret-key-change-in-production",
  REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || DEFAULT_REFRESH_EXPIRY,

  // Email (Resend HTTP API)
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,

  // Frontend URL for email links
  FRONTEND_URL: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
} as const;

// Validate critical env vars in production
if (process.env.NODE_ENV === "production") {
  const required = ["JWT_SECRET", "REFRESH_SECRET", "MONGODB_URI", "RESEND_API_KEY"] as const;
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
