import { Elysia } from "elysia";
import { authGuard } from "../auth/auth.guard";
import { Game, ALL_PATTERNS } from "../../models/game.model";
import { Ticket } from "../../models/ticket.model";
import { generateGameCode } from "./game.service";
import { createGameSchema, generateTicketsSchema } from "./game.schemas";
import { generateTicket } from "../ticket/ticket.generator";
import { successResponse, errorResponse } from "../../utils/response";

export const gameController = new Elysia({ prefix: "/games" })
  .use(authGuard)

  // ─── CREATE GAME ───────────────────────────────────────────
  .post(
    "/",
    async ({ body, currentUser, set }) => {
      const code = await generateGameCode();

      const game = await Game.create({
        code,
        host: currentUser._id,
        maxPlayers: body.maxPlayers ?? 50,
        numberCallInterval: body.numberCallInterval ?? 10,
        availablePatterns: body.availablePatterns ?? ALL_PATTERNS,
        players: [{ user: currentUser._id }],
      });

      set.status = 201;
      return successResponse(
        {
          id: game._id,
          code: game.code,
          host: currentUser.username,
          status: game.status,
          maxPlayers: game.maxPlayers,
          numberCallInterval: game.numberCallInterval,
          availablePatterns: game.availablePatterns,
          playerCount: 1,
        },
        "Game created"
      );
    },
    createGameSchema
  )

  // ─── LIST AVAILABLE GAMES ─────────────────────────────────
  .get("/", async ({ query }) => {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [games, total] = await Promise.all([
      Game.find({ status: "waiting" })
        .populate("host", "username displayName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Game.countDocuments({ status: "waiting" }),
    ]);

    return successResponse(
      {
        games: games.map((g) => ({
          id: g._id,
          code: g.code,
          host: g.host,
          status: g.status,
          playerCount: g.players.length,
          maxPlayers: g.maxPlayers,
          availablePatterns: g.availablePatterns,
          createdAt: g.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      "Available games"
    );
  })

  // ─── GET GAME BY CODE ─────────────────────────────────────
  .get("/:code", async ({ params, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() })
      .populate("host", "username displayName")
      .populate("players.user", "username displayName")
      .lean();

    if (!game) {
      set.status = 404;
      return errorResponse("Game not found");
    }

    return successResponse(
      {
        id: game._id,
        code: game.code,
        host: game.host,
        status: game.status,
        players: game.players,
        playerCount: game.players.length,
        maxPlayers: game.maxPlayers,
        calledNumbers: game.calledNumbers,
        currentNumber: game.currentNumber,
        numberCallInterval: game.numberCallInterval,
        winners: game.winners,
        availablePatterns: game.availablePatterns,
        startedAt: game.startedAt,
        createdAt: game.createdAt,
      },
      "Game details"
    );
  })

  // ─── JOIN GAME ─────────────────────────────────────────────
  .post("/:code/join", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });

    if (!game) {
      set.status = 404;
      return errorResponse("Game not found");
    }

    if (game.status !== "waiting") {
      set.status = 400;
      return errorResponse("Game has already started or ended");
    }

    if (game.players.length >= game.maxPlayers) {
      set.status = 400;
      return errorResponse("Game is full");
    }

    // Check if already joined
    const alreadyJoined = game.players.some(
      (p) => p.user.toString() === currentUser._id.toString()
    );

    if (alreadyJoined) {
      set.status = 400;
      return errorResponse("You have already joined this game");
    }

    game.players.push({ user: currentUser._id, joinedAt: new Date() });
    await game.save();

    return successResponse(
      {
        code: game.code,
        playerCount: game.players.length,
        maxPlayers: game.maxPlayers,
      },
      "Joined game successfully"
    );
  })

  // ─── LEAVE GAME ────────────────────────────────────────────
  .post("/:code/leave", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });

    if (!game) {
      set.status = 404;
      return errorResponse("Game not found");
    }

    if (game.status !== "waiting") {
      set.status = 400;
      return errorResponse("Cannot leave a game that has started");
    }

    // Host cannot leave — they must delete the game
    if (game.host.toString() === currentUser._id.toString()) {
      set.status = 400;
      return errorResponse("Host cannot leave. Delete the game instead.");
    }

    game.players = game.players.filter(
      (p) => p.user.toString() !== currentUser._id.toString()
    ) as typeof game.players;
    await game.save();

    // Also remove any tickets
    await Ticket.deleteMany({
      game: game._id,
      user: currentUser._id,
    });

    return successResponse(
      {
        code: game.code,
        playerCount: game.players.length,
      },
      "Left game successfully"
    );
  });
