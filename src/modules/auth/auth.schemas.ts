import { t } from "elysia";
import { USERNAME, PASSWORD, DISPLAY_NAME } from "../../config/constants";

/**
 * Validation schemas for authentication endpoints.
 */

export const registerSchema = {
  body: t.Object({
    username: t.String({ minLength: USERNAME.MIN_LENGTH, maxLength: USERNAME.MAX_LENGTH, pattern: USERNAME.PATTERN }),
    email: t.String({ format: "email" }),
    password: t.String({ minLength: PASSWORD.MIN_LENGTH, maxLength: PASSWORD.MAX_LENGTH }),
    displayName: t.String({ minLength: DISPLAY_NAME.MIN_LENGTH, maxLength: DISPLAY_NAME.MAX_LENGTH }),
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

export const verifyEmailSchema = {
  body: t.Object({
    token: t.String({ minLength: 1 }),
  }),
};

export const resendVerificationSchema = {
  body: t.Object({
    email: t.String({ format: "email" }),
  }),
};

export const forgotPasswordSchema = {
  body: t.Object({
    email: t.String({ format: "email" }),
  }),
};

export const resetPasswordSchema = {
  body: t.Object({
    token: t.String({ minLength: 1 }),
    password: t.String({ minLength: PASSWORD.MIN_LENGTH, maxLength: PASSWORD.MAX_LENGTH }),
  }),
};
