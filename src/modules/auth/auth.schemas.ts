import { t } from "elysia";

/**
 * Validation schemas for authentication endpoints.
 */

export const registerSchema = {
  body: t.Object({
    username: t.String({ minLength: 3, maxLength: 20, pattern: "^[a-zA-Z0-9_]+$" }),
    email: t.String({ format: "email" }),
    password: t.String({ minLength: 6, maxLength: 128 }),
    displayName: t.String({ minLength: 1, maxLength: 50 }),
  }),
};

export const loginSchema = {
  body: t.Object({
    login: t.String({ minLength: 1 }), // username or email
    password: t.String({ minLength: 1 }),
  }),
};

export const refreshSchema = {
  body: t.Object({
    refreshToken: t.String({ minLength: 1 }),
  }),
};
