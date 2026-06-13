import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../config/env";
import { User } from "../models/user.model";
import { Game, type WinPattern, type IGame } from "../models/game.model";
import { Ticket } from "../models/ticket.model";
import {
  drawNextNumber,
  validateClaim,
  isGameComplete,
} from "../modules/game/game.service";

/**
 * Active game timers — tracks setInterval IDs for number calling.
 * Key: game code, Value: Timer reference
 */
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * WebSocket handler for real-time Tambola gameplay.
 *
 * Connection URL: /ws/game/:code?token=<JWT>
 *
 * Server → Client messages:
 *   { type: "player_joined", data: { username, playerCount } }
 *   { type: "player_left", data: { username, playerCount } }
 *   { type: "game_started", data: { message } }
 *   { type: "game_paused", data: { message } }
 *   { type: "game_resumed", data: { message } }
 *   { type: "number_called", data: { number, calledNumbers, remaining } }
 *   { type: "claim_result", data: { pattern, winner, valid, message } }
 *   { type: "game_ended", data: { winners } }
 *   { type: "error", data: { message } }
 *
 * Client → Server messages:
 *   { action: "start_game" }
 *   { action: "pause_game" }
 *   { action: "resume_game" }
 *   { action: "claim", payload: { pattern, ticketId } }
 */
export const gameWebSocket = new Elysia({ prefix: "/ws" })
  .use(
    jwt({
      name: "wsJwt",
      secret: env.JWT_SECRET,
    })
  )
  .ws("/game/:code", {
    query: t.Object({
      token: t.String(),
    }),

    async open(ws) {
      const { code } = ws.data.params as { code: string };
      const token = (ws.data.query as { token: string }).token;

      // Authenticate via JWT
      const payload = await ws.data.wsJwt.verify(token);

      if (!payload || !payload.sub) {
        ws.send(JSON.stringify({ type: "error", data: { message: "Invalid token" } }));
        ws.close();
        return;
      }

      const user = await User.findById(payload.sub);
      if (!user) {
        ws.send(JSON.stringify({ type: "error", data: { message: "User not found" } }));
        ws.close();
        return;
      }

      const game = await Game.findOne({ code: code.toUpperCase() });
      if (!game) {
        ws.send(JSON.stringify({ type: "error", data: { message: "Game not found" } }));
        ws.close();
        return;
      }

      // Verify player is in the game
      const isPlayer = game.players.some(
        (p) => p.user.toString() === user._id.toString()
      );

      if (!isPlayer) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: { message: "You must join the game first" },
          })
        );
        ws.close();
        return;
      }

      // Store user data on the WebSocket
      (ws.data as any).userId = user._id.toString();
      (ws.data as any).username = user.username;
      (ws.data as any).gameCode = code.toUpperCase();

      // Subscribe to the game room
      ws.subscribe(code.toUpperCase());

      // Notify others
      ws.publish(
        code.toUpperCase(),
        JSON.stringify({
          type: "player_joined",
          data: {
            username: user.username,
            playerCount: game.players.length,
          },
        })
      );

      // Send current game state to the connecting player
      ws.send(
        JSON.stringify({
          type: "game_state",
          data: {
            status: game.status,
            calledNumbers: game.calledNumbers,
            currentNumber: game.currentNumber,
            winners: game.winners,
            playerCount: game.players.length,
          },
        })
      );
    },

    async message(ws, messageRaw) {
      let message: any;
      try {
        message =
          typeof messageRaw === "string"
            ? JSON.parse(messageRaw)
            : messageRaw;
      } catch {
        ws.send(
          JSON.stringify({ type: "error", data: { message: "Invalid JSON" } })
        );
        return;
      }

      const gameCode = (ws.data as any).gameCode as string;
      const userId = (ws.data as any).userId as string;
      const username = (ws.data as any).username as string;

      const game = await Game.findOne({ code: gameCode });
      if (!game) {
        ws.send(
          JSON.stringify({ type: "error", data: { message: "Game not found" } })
        );
        return;
      }

      switch (message.action) {
        // ─── START GAME ──────────────────────────────────────
        case "start_game": {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Only the host can start the game" },
              })
            );
            return;
          }

          if (game.status !== "waiting") {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Game is not in waiting state" },
              })
            );
            return;
          }

          // Check all players have at least 1 ticket
          const ticketCounts = await Ticket.aggregate([
            { $match: { game: game._id } },
            { $group: { _id: "$user", count: { $sum: 1 } } },
          ]);

          const playersWithTickets = new Set(
            ticketCounts.map((t: any) => t._id.toString())
          );

          const allHaveTickets = game.players.every((p) =>
            playersWithTickets.has(p.user.toString())
          );

          if (!allHaveTickets) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: {
                  message: "All players must have at least 1 ticket before starting",
                },
              })
            );
            return;
          }

          game.status = "in_progress";
          game.startedAt = new Date();
          await game.save();

          // Broadcast game started
          ws.publish(
            gameCode,
            JSON.stringify({
              type: "game_started",
              data: { message: "Game has started!" },
            })
          );
          ws.send(
            JSON.stringify({
              type: "game_started",
              data: { message: "Game has started!" },
            })
          );

          // Start automatic number calling
          startNumberCalling(gameCode, game.numberCallInterval, ws);
          break;
        }

        // ─── PAUSE GAME ─────────────────────────────────────
        case "pause_game": {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Only the host can pause the game" },
              })
            );
            return;
          }

          if (game.status !== "in_progress") {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Game is not in progress" },
              })
            );
            return;
          }

          game.status = "paused";
          await game.save();

          // Stop the timer
          stopNumberCalling(gameCode);

          ws.publish(
            gameCode,
            JSON.stringify({
              type: "game_paused",
              data: { message: "Game has been paused by host" },
            })
          );
          ws.send(
            JSON.stringify({
              type: "game_paused",
              data: { message: "Game has been paused" },
            })
          );
          break;
        }

        // ─── RESUME GAME ────────────────────────────────────
        case "resume_game": {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Only the host can resume the game" },
              })
            );
            return;
          }

          if (game.status !== "paused") {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Game is not paused" },
              })
            );
            return;
          }

          game.status = "in_progress";
          await game.save();

          ws.publish(
            gameCode,
            JSON.stringify({
              type: "game_resumed",
              data: { message: "Game has been resumed" },
            })
          );
          ws.send(
            JSON.stringify({
              type: "game_resumed",
              data: { message: "Game has been resumed" },
            })
          );

          // Restart number calling
          startNumberCalling(gameCode, game.numberCallInterval, ws);
          break;
        }

        // ─── CLAIM ───────────────────────────────────────────
        case "claim": {
          const { pattern, ticketId } = message.payload || {};

          if (!pattern || !ticketId) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Missing pattern or ticketId" },
              })
            );
            return;
          }

          if (game.status !== "in_progress") {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Game is not in progress" },
              })
            );
            return;
          }

          // Check if pattern is available
          if (!game.availablePatterns.includes(pattern as WinPattern)) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "This pattern is not available in this game" },
              })
            );
            return;
          }

          // Check if pattern already claimed
          if (game.winners[pattern as WinPattern]) {
            ws.send(
              JSON.stringify({
                type: "claim_result",
                data: {
                  pattern,
                  valid: false,
                  message: "This pattern has already been claimed",
                },
              })
            );
            return;
          }

          // Get the ticket
          const ticket = await Ticket.findOne({
            _id: ticketId,
            user: userId,
            game: game._id,
          });

          if (!ticket) {
            ws.send(
              JSON.stringify({
                type: "error",
                data: { message: "Ticket not found or does not belong to you" },
              })
            );
            return;
          }

          // Validate the claim server-side
          const isValid = validateClaim(
            pattern as WinPattern,
            ticket.grid,
            game.calledNumbers
          );

          if (!isValid) {
            // Bogus claim
            ws.send(
              JSON.stringify({
                type: "claim_result",
                data: {
                  pattern,
                  valid: false,
                  message: "Invalid claim — numbers don't match",
                },
              })
            );

            // Broadcast the failed claim
            ws.publish(
              gameCode,
              JSON.stringify({
                type: "claim_result",
                data: {
                  pattern,
                  valid: false,
                  username,
                  message: `${username}'s claim for ${pattern} was invalid`,
                },
              })
            );
            return;
          }

          // Valid claim!
          game.winners[pattern as WinPattern] = user._id as any;
          await game.save();

          // Update user stats
          await User.findByIdAndUpdate(userId, {
            $inc: { "stats.totalClaims": 1 },
          });

          const claimMsg = {
            type: "claim_result",
            data: {
              pattern,
              valid: true,
              winner: username,
              message: `${username} won ${pattern}!`,
            },
          };

          ws.send(JSON.stringify(claimMsg));
          ws.publish(gameCode, JSON.stringify(claimMsg));

          // Check if game is complete
          const refreshedGame = await Game.findById(game._id);
          if (refreshedGame && isGameComplete(refreshedGame)) {
            refreshedGame.status = "completed";
            refreshedGame.completedAt = new Date();
            await refreshedGame.save();

            stopNumberCalling(gameCode);

            // Update stats for all players
            const playerIds = refreshedGame.players.map((p) => p.user);
            await User.updateMany(
              { _id: { $in: playerIds } },
              { $inc: { "stats.gamesPlayed": 1 } }
            );

            // Update winner stats
            const winnerIds = Object.values(refreshedGame.winners).filter(Boolean);
            const uniqueWinners = [...new Set(winnerIds.map((id) => id!.toString()))];
            await User.updateMany(
              { _id: { $in: uniqueWinners } },
              { $inc: { "stats.gamesWon": 1 } }
            );

            const endMsg = {
              type: "game_ended",
              data: {
                winners: refreshedGame.winners,
                message: "All patterns claimed! Game over!",
              },
            };

            ws.send(JSON.stringify(endMsg));
            ws.publish(gameCode, JSON.stringify(endMsg));
          }
          break;
        }

        default:
          ws.send(
            JSON.stringify({
              type: "error",
              data: { message: `Unknown action: ${message.action}` },
            })
          );
      }
    },

    close(ws) {
      const gameCode = (ws.data as any).gameCode as string;
      const username = (ws.data as any).username as string;

      if (gameCode && username) {
        ws.unsubscribe(gameCode);
        ws.publish(
          gameCode,
          JSON.stringify({
            type: "player_left",
            data: { username },
          })
        );
      }
    },
  });

/**
 * Start automatic number calling for a game.
 */
function startNumberCalling(
  gameCode: string,
  intervalSeconds: number,
  ws: any
): void {
  // Clear any existing timer
  stopNumberCalling(gameCode);

  const timer = setInterval(async () => {
    const game = await Game.findOne({ code: gameCode });

    if (!game || game.status !== "in_progress") {
      stopNumberCalling(gameCode);
      return;
    }

    const nextNumber = drawNextNumber(game.calledNumbers);

    if (nextNumber === null) {
      // All 90 numbers called
      stopNumberCalling(gameCode);

      game.status = "completed";
      game.completedAt = new Date();
      await game.save();

      const endMsg = {
        type: "game_ended",
        data: {
          winners: game.winners,
          message: "All numbers have been called! Game over!",
        },
      };

      ws.publish(gameCode, JSON.stringify(endMsg));
      return;
    }

    // Update game state
    game.calledNumbers.push(nextNumber);
    game.currentNumber = nextNumber;
    await game.save();

    // Broadcast to all players in the room
    const callMsg = {
      type: "number_called",
      data: {
        number: nextNumber,
        calledNumbers: game.calledNumbers,
        remaining: 90 - game.calledNumbers.length,
      },
    };

    ws.publish(gameCode, JSON.stringify(callMsg));
    ws.send(JSON.stringify(callMsg));
  }, intervalSeconds * 1000);

  activeTimers.set(gameCode, timer);
}

/**
 * Stop the number calling timer for a game.
 */
function stopNumberCalling(gameCode: string): void {
  const timer = activeTimers.get(gameCode);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(gameCode);
  }
}
