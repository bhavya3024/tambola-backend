import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomBytes, createHash } from "crypto";
import { env } from "../../config/env";
import {
  PASSWORD_HASH,
  EMAIL_VERIFICATION_EXPIRY_MS,
  PASSWORD_RESET_EXPIRY_MS,
  DEFAULT_EXPIRY_SECONDS,
} from "../../config/constants";
import { User } from "../../models/user.model";
import { authGuard } from "./auth.guard";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schemas";
import { successResponse, errorResponse } from "../../utils/response";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../utils/email.service";

/**
 * Convert JWT_EXPIRY like "15m" or "7d" into seconds for exp claim.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return DEFAULT_EXPIRY_SECONDS;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return DEFAULT_EXPIRY_SECONDS;
  }
}

/**
 * Generate a verification token and its hash.
 * The raw token is sent to the user; the hash is stored in DB.
 */
function generateVerificationToken(): { raw: string; hashed: string } {
  const raw = randomBytes(32).toString("hex");
  const hashed = createHash("sha256").update(raw).digest("hex");
  return { raw, hashed };
}

/**
 * Hash a raw verification token (for lookup).
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const authController = new Elysia({ prefix: "/auth" })
  // JWT plugins for access and refresh tokens
  .use(
    jwt({
      name: "accessJwt",
      secret: env.JWT_SECRET,
    })
  )
  .use(
    jwt({
      name: "refreshJwt",
      secret: env.REFRESH_SECRET,
    })
  )

  // ─── REGISTER ──────────────────────────────────────────────
  .post(
    "/register",
    async ({ body, set }) => {
      const { username, email, password, displayName } = body;

      // Check if a user with this email already exists
      const userWithEmail = await User.findOne({ email }).select(
        "+emailVerificationToken +emailVerificationExpiry"
      );

      if (userWithEmail) {
        if (userWithEmail.isEmailVerified) {
          set.status = 409;
          return errorResponse("Email already registered");
        }

        // Email is registered but NOT verified. We can reuse/update this user record.
        // But first, make sure the requested username is not already taken by ANOTHER user.
        const userWithUsername = await User.findOne({ username });
        if (
          userWithUsername &&
          userWithUsername._id.toString() !== userWithEmail._id.toString()
        ) {
          set.status = 409;
          return errorResponse("Username already taken");
        }

        // Hash password using Bun's native argon2id
        const hashedPassword = await Bun.password.hash(password, {
          algorithm: PASSWORD_HASH.ALGORITHM,
          memoryCost: PASSWORD_HASH.MEMORY_COST,
          timeCost: PASSWORD_HASH.TIME_COST,
        });

        // Generate verification token
        const { raw: verifyToken, hashed: hashedVerifyToken } =
          generateVerificationToken();
        const verifyExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

        // Update the existing unverified user details
        userWithEmail.username = username;
        userWithEmail.password = hashedPassword;
        userWithEmail.displayName = displayName;
        userWithEmail.emailVerificationToken = hashedVerifyToken;
        userWithEmail.emailVerificationExpiry = verifyExpiry;
        userWithEmail.refreshToken = undefined;
        userWithEmail.passwordResetToken = undefined;
        userWithEmail.passwordResetExpiry = undefined;

        await userWithEmail.save();

        // Send verification email (fire-and-forget, don't block registration)
        sendVerificationEmail(email, verifyToken, displayName).catch((err) => {
          console.error("Failed to send verification email:", err);
        });

        set.status = 200;
        return successResponse(
          {
            email: userWithEmail.email,
            username: userWithEmail.username,
          },
          "Registration successful! Please check your email to verify your account."
        );
      }

      // If email does not exist, check if username is already taken by any other user
      const userWithUsername = await User.findOne({ username });
      if (userWithUsername) {
        set.status = 409;
        return errorResponse("Username already taken");
      }

      // Hash password using Bun's native argon2id
      const hashedPassword = await Bun.password.hash(password, {
        algorithm: PASSWORD_HASH.ALGORITHM,
        memoryCost: PASSWORD_HASH.MEMORY_COST,
        timeCost: PASSWORD_HASH.TIME_COST,
      });

      // Generate verification token
      const { raw: verifyToken, hashed: hashedVerifyToken } =
        generateVerificationToken();
      const verifyExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

      // Create user (unverified)
      const user = await User.create({
        username,
        email,
        password: hashedPassword,
        displayName,
        isEmailVerified: false,
        emailVerificationToken: hashedVerifyToken,
        emailVerificationExpiry: verifyExpiry,
      });

      // Send verification email (fire-and-forget, don't block registration)
      sendVerificationEmail(email, verifyToken, displayName).catch((err) => {
        console.error("Failed to send verification email:", err);
      });

      set.status = 201;
      return successResponse(
        {
          email: user.email,
          username: user.username,
        },
        "Registration successful! Please check your email to verify your account."
      );
    },
    registerSchema
  )

  // ─── VERIFY EMAIL ──────────────────────────────────────────
  .post(
    "/verify-email",
    async ({ body, set }) => {
      const hashedToken = hashToken(body.token);

      const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { $gt: new Date() },
      }).select("+emailVerificationToken +emailVerificationExpiry");

      if (!user) {
        set.status = 400;
        return errorResponse("Invalid or expired verification link. Please request a new one.");
      }

      // Mark as verified and clear token
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpiry = undefined;
      await user.save();

      return successResponse(null, "Email verified successfully! You can now log in.");
    },
    verifyEmailSchema
  )

  // ─── RESEND VERIFICATION ───────────────────────────────────
  .post(
    "/resend-verification",
    async ({ body, set }) => {
      const user = await User.findOne({ email: body.email.toLowerCase() });

      if (!user) {
        // Don't reveal whether the email exists
        return successResponse(null, "If that email is registered, a verification link has been sent.");
      }

      if (user.isEmailVerified) {
        set.status = 400;
        return errorResponse("Email is already verified. You can log in.");
      }

      // Generate new token
      const { raw: verifyToken, hashed: hashedVerifyToken } = generateVerificationToken();
      const verifyExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

      await User.findByIdAndUpdate(user._id, {
        emailVerificationToken: hashedVerifyToken,
        emailVerificationExpiry: verifyExpiry,
      });

      sendVerificationEmail(user.email, verifyToken, user.displayName).catch((err) => {
        console.error("Failed to send verification email:", err);
      });

      return successResponse(null, "If that email is registered, a verification link has been sent.");
    },
    resendVerificationSchema
  )

  // ─── LOGIN ─────────────────────────────────────────────────
  .post(
    "/login",
    async ({ body, accessJwt, refreshJwt, set }) => {
      const { login, password } = body;

      // Find user by email or username (include password field)
      const user = await User.findOne({
        $or: [{ email: login.toLowerCase() }, { username: login.toLowerCase() }],
      }).select("+password");

      if (!user) {
        set.status = 401;
        return errorResponse("Invalid credentials");
      }

      if (!user.isActive) {
        set.status = 403;
        return errorResponse("Account is deactivated");
      }

      // Check email verification
      if (!user.isEmailVerified) {
        set.status = 403;
        return errorResponse("Please verify your email before logging in. Check your inbox for the verification link.");
      }

      // Verify password
      const isValidPassword = await Bun.password.verify(password, user.password);

      if (!isValidPassword) {
        set.status = 401;
        return errorResponse("Invalid credentials");
      }

      // Generate tokens
      const accessToken = await accessJwt.sign({
        sub: user._id.toString(),
        exp: Math.floor(Date.now() / 1000) + parseExpiry(env.JWT_EXPIRY),
      });

      const refreshToken = await refreshJwt.sign({
        sub: user._id.toString(),
        exp: Math.floor(Date.now() / 1000) + parseExpiry(env.REFRESH_EXPIRY),
      });

      // Store hashed refresh token
      const hashedRefreshToken = await Bun.password.hash(refreshToken, {
        algorithm: PASSWORD_HASH.ALGORITHM,
        memoryCost: PASSWORD_HASH.MEMORY_COST,
        timeCost: PASSWORD_HASH.TIME_COST,
      });
      await User.findByIdAndUpdate(user._id, { refreshToken: hashedRefreshToken });

      return successResponse(
        {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            stats: user.stats,
          },
          accessToken,
          refreshToken,
        },
        "Login successful"
      );
    },
    loginSchema
  )

  // ─── REFRESH TOKEN ─────────────────────────────────────────
  .post(
    "/refresh",
    async ({ body, accessJwt, refreshJwt, set }) => {
      const { refreshToken } = body;

      // Verify the refresh token
      const payload = await refreshJwt.verify(refreshToken);

      if (!payload || !payload.sub) {
        set.status = 401;
        return errorResponse("Invalid or expired refresh token");
      }

      // Find user with stored refresh token
      const user = await User.findById(payload.sub).select("+refreshToken");

      if (!user || !user.refreshToken || !user.isActive) {
        set.status = 401;
        return errorResponse("Invalid refresh token");
      }

      // Verify stored refresh token matches
      const isValidRefresh = await Bun.password.verify(refreshToken, user.refreshToken);

      if (!isValidRefresh) {
        set.status = 401;
        return errorResponse("Invalid refresh token");
      }

      // Generate new tokens
      const newAccessToken = await accessJwt.sign({
        sub: user._id.toString(),
        exp: Math.floor(Date.now() / 1000) + parseExpiry(env.JWT_EXPIRY),
      });

      const newRefreshToken = await refreshJwt.sign({
        sub: user._id.toString(),
        exp: Math.floor(Date.now() / 1000) + parseExpiry(env.REFRESH_EXPIRY),
      });

      // Rotate refresh token
      const hashedRefreshToken = await Bun.password.hash(newRefreshToken, {
        algorithm: PASSWORD_HASH.ALGORITHM,
        memoryCost: PASSWORD_HASH.MEMORY_COST,
        timeCost: PASSWORD_HASH.TIME_COST,
      });
      await User.findByIdAndUpdate(user._id, { refreshToken: hashedRefreshToken });

      return successResponse(
        {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        "Token refreshed"
      );
    },
    refreshSchema
  )

  // ─── FORGOT PASSWORD ──────────────────────────────────────────
  .post(
    "/forgot-password",
    async ({ body }) => {
      const user = await User.findOne({ email: body.email.toLowerCase() });

      // Always return success to avoid leaking whether email exists
      if (!user) {
        return successResponse(null, "If that email is registered, a password reset link has been sent.");
      }

      // Generate reset token (1 hour expiry)
      const { raw: resetToken, hashed: hashedResetToken } = generateVerificationToken();
      const resetExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

      await User.findByIdAndUpdate(user._id, {
        passwordResetToken: hashedResetToken,
        passwordResetExpiry: resetExpiry,
      });

      sendPasswordResetEmail(user.email, resetToken, user.displayName).catch((err) => {
        console.error("Failed to send password reset email:", err);
      });

      return successResponse(null, "If that email is registered, a password reset link has been sent.");
    },
    forgotPasswordSchema
  )

  // ─── RESET PASSWORD ───────────────────────────────────────────
  .post(
    "/reset-password",
    async ({ body, set }) => {
      const hashedToken = hashToken(body.token);

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpiry: { $gt: new Date() },
      }).select("+passwordResetToken +passwordResetExpiry");

      if (!user) {
        set.status = 400;
        return errorResponse("Invalid or expired reset link. Please request a new one.");
      }

      // Hash the new password
      const hashedPassword = await Bun.password.hash(body.password, {
        algorithm: PASSWORD_HASH.ALGORITHM,
        memoryCost: PASSWORD_HASH.MEMORY_COST,
        timeCost: PASSWORD_HASH.TIME_COST,
      });

      // Update password and clear reset token + invalidate sessions
      user.password = hashedPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpiry = undefined;
      user.refreshToken = undefined;
      await user.save();

      return successResponse(null, "Password reset successfully! You can now log in with your new password.");
    },
    resetPasswordSchema
  )

  // ─── GET ME (protected) ────────────────────────────────────
  .use(authGuard)
  .get("/me", async ({ currentUser }) => {
    return successResponse(
      {
        id: currentUser._id,
        username: currentUser.username,
        email: currentUser.email,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
        stats: currentUser.stats,
        createdAt: currentUser.createdAt,
      },
      "User profile"
    );
  })

  // ─── LOGOUT (protected) ────────────────────────────────────
  .post("/logout", async ({ currentUser }) => {
    await User.findByIdAndUpdate(currentUser._id, {
      $unset: { refreshToken: 1 },
    });

    return successResponse(null, "Logged out successfully");
  });