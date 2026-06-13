import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../../config/env";
import { User } from "../../models/user.model";
import { authGuard } from "./auth.guard";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas";
import { successResponse, errorResponse } from "../../utils/response";

/**
 * Convert JWT_EXPIRY like "15m" or "7d" into seconds for exp claim.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15 min

  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return 900;
  }
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
    async ({ body, accessJwt, refreshJwt, set }) => {
      const { username, email, password, displayName } = body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        set.status = 409;
        return errorResponse(
          existingUser.email === email
            ? "Email already registered"
            : "Username already taken"
        );
      }

      // Hash password using Bun's native argon2id
      const hashedPassword = await Bun.password.hash(password, {
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
      });

      // Create user
      const user = await User.create({
        username,
        email,
        password: hashedPassword,
        displayName,
      });

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
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
      });
      await User.findByIdAndUpdate(user._id, { refreshToken: hashedRefreshToken });

      set.status = 201;
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
        "Registration successful"
      );
    },
    registerSchema
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
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
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
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
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
