import { Elysia } from "elysia";
import { authGuard } from "../auth/auth.guard";
import { Game, ALL_PATTERNS } from "../../models/game.model";
import { User } from "../../models/user.model";
import { Ticket } from "../../models/ticket.model";
import { generateGameCode } from "./game.service";
import { createGameSchema } from "./game.schemas";
import { generateTickets } from "../ticket/ticket.generator";
import { successResponse, errorResponse } from "../../utils/response";
import {
  PLAYERS,
  NUMBER_CALL_INTERVAL,
  TICKETS_PER_PLAYER,
  PAGINATION,
  GAME_STATUS,
  ALL_GAME_STATUSES,
} from "../../config/constants";

export const gameController = new Elysia({ prefix: "/games" })
  .use(authGuard)

  .post(
    "/",
    async ({ body, currentUser, set }) => {
      const ticketsPerPlayer = body.ticketsPerPlayer ?? TICKETS_PER_PLAYER.DEFAULT;
      const code = await generateGameCode();
      const game = await Game.create({
        code,
        host: currentUser._id,
        maxPlayers: body.maxPlayers ?? PLAYERS.DEFAULT,
        numberCallInterval: body.numberCallInterval ?? NUMBER_CALL_INTERVAL.DEFAULT,
        ticketsPerPlayer,
        availablePatterns: body.availablePatterns ?? ALL_PATTERNS,
        players: [{ user: currentUser._id }],
      });

      // Auto-generate tickets for the host
      const grids = generateTickets(ticketsPerPlayer);
      await Ticket.insertMany(
        grids.map((grid) => ({ game: game._id, user: currentUser._id, grid }))
      );

      set.status = 201;
      return successResponse(
        {
          id: game._id,
          code: game.code,
          host: currentUser.username,
          status: game.status,
          maxPlayers: game.maxPlayers,
          ticketsPerPlayer: game.ticketsPerPlayer,
          numberCallInterval: game.numberCallInterval,
          availablePatterns: game.availablePatterns,
          playerCount: 1,
        },
        "Game created"
      );
    },
    createGameSchema
  )

  // List available (waiting) games
  .get("/", async ({ query }) => {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || PAGINATION.GAMES_LIST;
    const skip = (page - 1) * limit;
    const [games, total] = await Promise.all([
      Game.find({ status: GAME_STATUS.WAITING })
        .populate("host", "username displayName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Game.countDocuments({ status: GAME_STATUS.WAITING }),
    ]);
    return successResponse(
      {
        games: games.map((g) => ({
          id: g._id, code: g.code, host: g.host, status: g.status,
          playerCount: g.players.length, maxPlayers: g.maxPlayers,
          ticketsPerPlayer: g.ticketsPerPlayer,
          availablePatterns: g.availablePatterns, createdAt: g.createdAt,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      "Available games"
    );
  })

  // Game history — games the current user has participated in
  .get("/history", async ({ query, currentUser }) => {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || PAGINATION.GAME_HISTORY;
    const skip = (page - 1) * limit;
    const statusFilter = query.status as string | undefined;

    const filter: any = { "players.user": currentUser._id };
    if (statusFilter && ALL_GAME_STATUSES.includes(statusFilter as any)) {
      filter.status = statusFilter;
    }

    const [games, total] = await Promise.all([
      Game.find(filter)
        .populate("host", "username displayName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Game.countDocuments(filter),
    ]);

    // Resolve winners for completed games
    const resolvedGames = await Promise.all(
      games.map(async (g) => {
        const resolvedWinners: Record<string, string> = {};
        const winnersObj = (g.winners || {}) as Record<string, any>;
        const winnerEntries = Object.entries(winnersObj).filter(([_, id]) => id != null);

        if (winnerEntries.length > 0) {
          const userIds = winnerEntries.map(([_, id]) => id.toString());
          const users = await User.find({ _id: { $in: userIds } }, "username").lean();
          const userMap = new Map(users.map((u: any) => [u._id.toString(), u.username]));
          for (const [pattern, id] of winnerEntries) {
            resolvedWinners[pattern] = userMap.get(id.toString()) || "Unknown";
          }
        }

        return {
          id: g._id,
          code: g.code,
          host: g.host,
          status: g.status,
          playerCount: g.players.length,
          maxPlayers: g.maxPlayers,
          ticketsPerPlayer: g.ticketsPerPlayer,
          availablePatterns: g.availablePatterns,
          winners: resolvedWinners,
          isHost: g.host._id?.toString() === currentUser._id.toString(),
          startedAt: g.startedAt,
          completedAt: g.completedAt,
          createdAt: g.createdAt,
        };
      })
    );

    return successResponse(
      {
        games: resolvedGames,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      "Game history"
    );
  })

  // Get game details
  .get("/:code", async ({ params, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() })
      .populate("host", "username displayName")
      .populate("players.user", "username displayName")
      .lean();
    if (!game) { set.status = 404; return errorResponse("Game not found"); }

    // Resolve winner ObjectIDs to username strings
    const resolvedWinners: Record<string, string> = {};
    const winnersObj = (game.winners || {}) as Record<string, any>;
    const winnerEntries = Object.entries(winnersObj).filter(([_, id]) => id != null);

    if (winnerEntries.length > 0) {
      const userIds = winnerEntries.map(([_, id]) => id.toString());
      const users = await User.find({ _id: { $in: userIds } }, "username").lean();
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u.username]));

      for (const [pattern, id] of winnerEntries) {
        resolvedWinners[pattern] = userMap.get(id.toString()) || "Unknown";
      }
    }

    return successResponse(
      {
        id: game._id, code: game.code, host: game.host, status: game.status,
        players: game.players, playerCount: game.players.length,
        maxPlayers: game.maxPlayers, ticketsPerPlayer: game.ticketsPerPlayer,
        calledNumbers: game.calledNumbers,
        currentNumber: game.currentNumber, numberCallInterval: game.numberCallInterval,
        winners: resolvedWinners, availablePatterns: game.availablePatterns,
        startedAt: game.startedAt, createdAt: game.createdAt,
      },
      "Game details"
    );
  })

  // Join game — auto-generates tickets for the joining player
  .post("/:code/join", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });
    if (!game) { set.status = 404; return errorResponse("Game not found"); }
    if (game.status !== GAME_STATUS.WAITING) { set.status = 400; return errorResponse("Game has already started or ended"); }
    if (game.players.length >= game.maxPlayers) { set.status = 400; return errorResponse("Game is full"); }
    const alreadyJoined = game.players.some((p) => p.user.toString() === currentUser._id.toString());
    if (alreadyJoined) { set.status = 400; return errorResponse("You have already joined this game"); }

    game.players.push({ user: currentUser._id, joinedAt: new Date() });
    await game.save();

    // Auto-generate tickets for the player
    const grids = generateTickets(game.ticketsPerPlayer);
    await Ticket.insertMany(
      grids.map((grid) => ({ game: game._id, user: currentUser._id, grid }))
    );

    return successResponse(
      {
        code: game.code,
        playerCount: game.players.length,
        maxPlayers: game.maxPlayers,
        ticketsGenerated: game.ticketsPerPlayer,
      },
      "Joined game successfully"
    );
  })

  .post("/:code/leave", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });
    if (!game) { set.status = 404; return errorResponse("Game not found"); }
    if (game.status !== GAME_STATUS.WAITING) { set.status = 400; return errorResponse("Cannot leave a game that has started"); }
    if (game.host.toString() === currentUser._id.toString()) { set.status = 400; return errorResponse("Host cannot leave. Delete the game instead."); }
    game.players = game.players.filter((p) => p.user.toString() !== currentUser._id.toString()) as typeof game.players;
    await game.save();
    await Ticket.deleteMany({ game: game._id, user: currentUser._id });
    return successResponse({ code: game.code, playerCount: game.players.length }, "Left game successfully");
  });