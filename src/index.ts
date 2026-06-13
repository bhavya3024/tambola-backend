import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { env } from "./config/env";
import { connectDB } from "./database/connection";
import { authController } from "./modules/auth/auth.controller";
import { gameController } from "./modules/game/game.controller";
import { ticketController } from "./modules/ticket/ticket.controller";
import { gameWebSocket } from "./ws/game.ws";

// Connect to MongoDB
await connectDB();

const app = new Elysia()
  // ─── Plugins ─────────────────────────────────────────────
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Tambola API",
          version: "1.0.0",
          description: "Online Tambola (Housie) game backend API",
        },
        tags: [
          { name: "Auth", description: "Authentication endpoints" },
          { name: "Games", description: "Game management endpoints" },
          { name: "Tickets", description: "Ticket management endpoints" },
        ],
      },
    })
  )

  // ─── Global error handler ────────────────────────────────
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Validation error",
        errors: error.message,
      };
    }

    if (error.message.includes("Unauthorized") || error.message.includes("Invalid")) {
      set.status = 401;
      return {
        success: false,
        message: error.message,
      };
    }

    console.error("Unhandled error:", error);
    set.status = 500;
    return {
      success: false,
      message: "Internal server error",
    };
  })

  // ─── Health check ─────────────────────────────────────────
  .get("/", () => ({
    success: true,
    message: "🎯 Tambola API is running",
    version: "1.0.0",
    docs: "/swagger",
  }))

  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))

  // ─── API Routes ──────────────────────────────────────────
  .group("/api", (app) =>
    app
      .use(authController)
      .use(gameController)
      .use(ticketController)
  )

  // ─── WebSocket ────────────────────────────────────────────
  .use(gameWebSocket)

  // ─── Start ────────────────────────────────────────────────
  .listen(env.PORT);

console.log(`
🎯 ══════════════════════════════════════════════
   Tambola Backend is running!
   
   🌐 HTTP:      http://localhost:${env.PORT}
   📚 Swagger:   http://localhost:${env.PORT}/swagger
   🔌 WebSocket: ws://localhost:${env.PORT}/ws/game/:code
   
   Environment: ${process.env.NODE_ENV || "development"}
🎯 ══════════════════════════════════════════════
`);

export type App = typeof app;
