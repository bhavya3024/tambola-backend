import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../../config/env";
import { User } from "../../models/user.model";

/**
 * Auth guard — Elysia plugin that verifies JWT and attaches the user to context.
 * Use `.use(authGuard)` on any route group that requires authentication.
 */
export const authGuard = new Elysia({ name: "auth-guard" })
  .use(
    jwt({
      name: "jwt",
      secret: env.JWT_SECRET,
    })
  )
  .derive({ as: "scoped" }, async ({ jwt, headers, set }) => {
    const authorization = headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Missing or invalid Authorization header");
    }

    const token = authorization.slice(7);

    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      throw new Error("Invalid or expired token");
    }

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      set.status = 401;
      throw new Error("User not found or inactive");
    }

    return {
      currentUser: user,
    };
  });
