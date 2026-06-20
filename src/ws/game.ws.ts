import { Elysia, t } from "elysia";
import { Types } from "mongoose";
import { jwt } from "@elysiajs/jwt";
import { env } from "../config/env";
import {
  TOTAL_NUMBERS,
  GAME_STATUS,
  WS_ACTION,
  WS_EVENT,
} from "../config/constants";
import { User } from "../models/user.model";
import { Game, type WinPattern, type IGame } from "../models/game.model";
import { Ticket } from "../models/ticket.model";
import {
  drawNextNumber,
  validateClaim,
  isGameComplete,
} from "../modules/game/game.service";

/**
 * Active game timers — tracks setTimeout IDs for number calling.
 * Key: game code, Value: Timer reference
 */
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reference to the Bun server for publishing from timers.
 * Set via setServer() after app.listen().
 */
let serverRef: { publish: (topic: string, data: string) => void } | null = null;

/**
 * Store the server reference so timers can publish to WS topics.
 */
export function setServer(server: { publish: (topic: string, data: string) => void }) {
  serverRef = server;
}

/**
 * Resume number-calling timers for any in-progress games.
 * Call this on server startup after setServer().
 */
export async function resumeActiveGames() {
  const activeGames = await Game.find({ status: GAME_STATUS.IN_PROGRESS });

  if (activeGames.length === 0) {
    console.log("📋 No active games to resume.");
    return;
  }

  for (const game of activeGames) {
    console.log(`🔄 Resuming number calling for game ${game.code}`);
    startNumberCalling(game.code, game.numberCallInterval);
  }

  console.log(`✅ Resumed ${activeGames.length} active game(s).`);
}

/**
 * Resolve winner ObjectIDs to usernames.
 * Returns a map like { earlyFive: "john", topLine: "jane", ... }
 */
async function resolveWinnerNames(
  winners: Record<string, any>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const ids = Object.entries(winners)
    .filter(([_, id]) => id != null)
    .map(([pattern, id]) => ({ pattern, id: id.toString() }));

  if (ids.length === 0) return resolved;

  const users = await User.find(
    { _id: { $in: ids.map((i) => i.id) } },
    "username"
  ).lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u.username]));

  for (const { pattern, id } of ids) {
    resolved[pattern] = userMap.get(id) || "Unknown";
  }

  return resolved;
}

/**
 * WebSocket handler for real-time Tambola gameplay.
 *
 * Connection URL: /ws/game/:code?token=<JWT>
 *
 * Server → Client messages:
 *   { type: WS_EVENT.PLAYER_JOINED, data: { username, playerCount } }
 *   { type: WS_EVENT.PLAYER_LEFT, data: { username, playerCount } }
 *   { type: WS_EVENT.GAME_STARTED, data: { message } }
 *   { type: WS_EVENT.GAME_PAUSED, data: { message } }
 *   { type: WS_EVENT.GAME_RESUMED, data: { message } }
 *   { type: WS_EVENT.NUMBER_CALLED, data: { number, calledNumbers, remaining } }
 *   { type: WS_EVENT.CLAIM_RESULT, data: { pattern, winner, valid, message } }
 *   { type: WS_EVENT.GAME_ENDED, data: { winners } }
 *   { type: WS_EVENT.ERROR, data: { message } }
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
        ws.send(JSON.stringify({ type: WS_EVENT.ERROR, data: { message: "Invalid token" } }));
        ws.close();
        return;
      }

      const user = await User.findById(payload.sub);
      if (!user) {
        ws.send(JSON.stringify({ type: WS_EVENT.ERROR, data: { message: "User not found" } }));
        ws.close();
        return;
      }

      const game = await Game.findOne({ code: code.toUpperCase() });
      if (!game) {
        ws.send(JSON.stringify({ type: WS_EVENT.ERROR, data: { message: "Game not found" } }));
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
            type: WS_EVENT.ERROR,
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
          type: WS_EVENT.PLAYER_JOINED,
          data: {
            username: user.username,
            playerCount: game.players.length,
          },
        })
      );

      // Send current game state to the connecting player
      const resolvedWinners = await resolveWinnerNames(game.winners as any);
      ws.send(
        JSON.stringify({
          type: WS_EVENT.GAME_STATE,
          data: {
            status: game.status,
            calledNumbers: game.calledNumbers,
            currentNumber: game.currentNumber,
            winners: resolvedWinners,
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
          JSON.stringify({ type: WS_EVENT.ERROR, data: { message: "Invalid JSON" } })
        );
        return;
      }

      const gameCode = (ws.data as any).gameCode as string;
      const userId = (ws.data as any).userId as string;
      const username = (ws.data as any).username as string;

      const game = await Game.findOne({ code: gameCode });
      if (!game) {
        ws.send(
          JSON.stringify({ type: WS_EVENT.ERROR, data: { message: "Game not found" } })
        );
        return;
      }

      switch (message.action) {
        // ─── START GAME ──────────────────────────────────────
        case WS_ACTION.START_GAME: {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Only the host can start the game" },
              })
            );
            return;
          }

          if (game.status !== GAME_STATUS.WAITING) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
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
                type: WS_EVENT.ERROR,
                data: {
                  message: "All players must have at least 1 ticket before starting",
                },
              })
            );
            return;
          }

          game.status = GAME_STATUS.IN_PROGRESS;
          game.startedAt = new Date();
          await game.save();

          // Broadcast game started
          ws.publish(
            gameCode,
            JSON.stringify({
              type: WS_EVENT.GAME_STARTED,
              data: { message: "Game has started!" },
            })
          );
          ws.send(
            JSON.stringify({
              type: WS_EVENT.GAME_STARTED,
              data: { message: "Game has started!" },
            })
          );

          // Start automatic number calling
          startNumberCalling(gameCode, game.numberCallInterval);
          break;
        }

        // ─── PAUSE GAME ─────────────────────────────────────
        case WS_ACTION.PAUSE_GAME: {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Only the host can pause the game" },
              })
            );
            return;
          }

          if (game.status !== GAME_STATUS.IN_PROGRESS) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Game is not in progress" },
              })
            );
            return;
          }

          game.status = GAME_STATUS.PAUSED;
          await game.save();

          // Stop the timer
          stopNumberCalling(gameCode);

          ws.publish(
            gameCode,
            JSON.stringify({
              type: WS_EVENT.GAME_PAUSED,
              data: { message: "Game has been paused by host" },
            })
          );
          ws.send(
            JSON.stringify({
              type: WS_EVENT.GAME_PAUSED,
              data: { message: "Game has been paused" },
            })
          );
          break;
        }

        // ─── RESUME GAME ────────────────────────────────────
        case WS_ACTION.RESUME_GAME: {
          if (game.host.toString() !== userId) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Only the host can resume the game" },
              })
            );
            return;
          }

          if (game.status !== GAME_STATUS.PAUSED) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Game is not paused" },
              })
            );
            return;
          }

          game.status = GAME_STATUS.IN_PROGRESS;
          await game.save();

          ws.publish(
            gameCode,
            JSON.stringify({
              type: WS_EVENT.GAME_RESUMED,
              data: { message: "Game has been resumed" },
            })
          );
          ws.send(
            JSON.stringify({
              type: WS_EVENT.GAME_RESUMED,
              data: { message: "Game has been resumed" },
            })
          );

          // Restart number calling
          startNumberCalling(gameCode, game.numberCallInterval);
          break;
        }

        // ─── CLAIM ───────────────────────────────────────────
        case WS_ACTION.CLAIM: {
          const { pattern, ticketId } = message.payload || {};

          if (!pattern || !ticketId) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Missing pattern or ticketId" },
              })
            );
            return;
          }

          if (game.status !== GAME_STATUS.IN_PROGRESS) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "Game is not in progress" },
              })
            );
            return;
          }

          // Check if pattern is available
          if (!game.availablePatterns.includes(pattern as WinPattern)) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.ERROR,
                data: { message: "This pattern is not available in this game" },
              })
            );
            return;
          }

          // Check if pattern already claimed
          if (game.winners[pattern as WinPattern]) {
            ws.send(
              JSON.stringify({
                type: WS_EVENT.CLAIM_RESULT,
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
                type: WS_EVENT.ERROR,
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
                type: WS_EVENT.CLAIM_RESULT,
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
                type: WS_EVENT.CLAIM_RESULT,
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
          game.winners[pattern as WinPattern] = new Types.ObjectId(userId) as any;
          await game.save();

          // Update user stats
          await User.findByIdAndUpdate(userId, {
            $inc: { "stats.totalClaims": 1 },
          });

          const claimMsg = {
            type: WS_EVENT.CLAIM_RESULT,
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
            refreshedGame.status = GAME_STATUS.COMPLETED;
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

            const resolvedEndWinners = await resolveWinnerNames(refreshedGame.winners as any);
            const endMsg = {
              type: WS_EVENT.GAME_ENDED,
              data: {
                winners: resolvedEndWinners,
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
              type: WS_EVENT.ERROR,
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
            type: WS_EVENT.PLAYER_LEFT,
            data: { username },
          })
        );
      }
    },
  });

/**
 * Get a random delay between min and max seconds (inclusive).
 */
function getRandomDelay(minSec: number = 2, maxSec: number = 6): number {
  return (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
}

/**
 * Start automatic number calling for a game.
 * Uses recursive setTimeout with a random delay (2-6 seconds) between each call.
 * Uses the server-level publish to broadcast to all subscribers of the game topic.
 */
export function startNumberCalling(
  gameCode: string,
  _intervalSeconds?: number
): void {
  // Clear any existing timer
  stopNumberCalling(gameCode);

  function scheduleNext() {
    const delay = getRandomDelay(2, 6);

    const timer = setTimeout(async () => {
      try {
        const game = await Game.findOne({ code: gameCode });

        if (!game || game.status !== GAME_STATUS.IN_PROGRESS) {
          stopNumberCalling(gameCode);
          return;
        }

        const nextNumber = drawNextNumber(game.calledNumbers);

        if (nextNumber === null) {
          // All numbers called
          stopNumberCalling(gameCode);

          game.status = GAME_STATUS.COMPLETED;
          game.completedAt = new Date();
          await game.save();

          const resolvedTimerWinners = await resolveWinnerNames(game.winners as any);
          const endMsg = {
            type: WS_EVENT.GAME_ENDED,
            data: {
              winners: resolvedTimerWinners,
              message: "All numbers have been called! Game over!",
            },
          };

          serverRef?.publish(gameCode, JSON.stringify(endMsg));
          return;
        }

        // Update game state
        game.calledNumbers.push(nextNumber);
        game.currentNumber = nextNumber;
        await game.save();

        // Broadcast to all players in the room
        const callMsg = {
          type: WS_EVENT.NUMBER_CALLED,
          data: {
            number: nextNumber,
            calledNumbers: game.calledNumbers,
            remaining: TOTAL_NUMBERS - game.calledNumbers.length,
          },
        };

        serverRef?.publish(gameCode, JSON.stringify(callMsg));

        // Schedule the next number with a new random delay
        scheduleNext();
      } catch (err) {
        console.error(`Error in number calling for game ${gameCode}:`, err);
        // Still try to continue on error
        scheduleNext();
      }
    }, delay);

    activeTimers.set(gameCode, timer);
  }

  scheduleNext();
}

/**
 * Stop the number calling timer for a game.
 */
function stopNumberCalling(gameCode: string): void {
  const timer = activeTimers.get(gameCode);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(gameCode);
  }
}

