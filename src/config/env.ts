/**
 * Environment configuration — loads and validates env vars.
 * Bun auto-loads .env files, so we just read from process.env.
 */

export const env = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/tambola",
  JWT_SECRET: process.env.JWT_SECRET || "tambola-super-secret-key-change-in-production",
  JWT_EXPIRY: process.env.JWT_EXPIRY || "15m",
  REFRESH_SECRET: process.env.REFRESH_SECRET || "tambola-refresh-secret-key-change-in-production",
  REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || "7d",
} as const;

// Validate critical env vars in production
if (process.env.NODE_ENV === "production") {
  const required = ["JWT_SECRET", "REFRESH_SECRET", "MONGODB_URI"] as const;
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
