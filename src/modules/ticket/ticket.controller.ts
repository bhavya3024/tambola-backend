import { Elysia } from "elysia";
import { authGuard } from "../auth/auth.guard";
import { Game } from "../../models/game.model";
import { Ticket } from "../../models/ticket.model";
import { generateTickets } from "./ticket.generator";
import { generateTicketsSchema } from "../game/game.schemas";
import { successResponse, errorResponse } from "../../utils/response";

export const ticketController = new Elysia({ prefix: "/games" })
  .use(authGuard)

  // ─── GENERATE TICKETS ──────────────────────────────────────
  .post(
    "/:code/tickets",
    async ({ params, body, currentUser, set }) => {
      const game = await Game.findOne({ code: params.code.toUpperCase() });

      if (!game) {
        set.status = 404;
        return errorResponse("Game not found");
      }

      // Must be in the game
      const isPlayer = game.players.some(
        (p) => p.user.toString() === currentUser._id.toString()
      );

      if (!isPlayer) {
        set.status = 403;
        return errorResponse("You must join the game first");
      }

      if (game.status !== "waiting") {
        set.status = 400;
        return errorResponse("Cannot generate tickets after game has started");
      }

      // Check existing ticket count
      const existingCount = await Ticket.countDocuments({
        game: game._id,
        user: currentUser._id,
      });

      const totalCount = existingCount + body.count;
      if (totalCount > 6) {
        set.status = 400;
        return errorResponse(
          `Maximum 6 tickets per player. You already have ${existingCount}.`
        );
      }

      // Generate tickets
      const grids = generateTickets(body.count);

      const tickets = await Ticket.insertMany(
        grids.map((grid) => ({
          game: game._id,
          user: currentUser._id,
          grid,
        }))
      );

      set.status = 201;
      return successResponse(
        {
          tickets: tickets.map((t) => ({
            id: t._id,
            grid: t.grid,
          })),
          totalTickets: totalCount,
        },
        `${body.count} ticket(s) generated`
      );
    },
    generateTicketsSchema
  )

  // ─── GET MY TICKETS FOR A GAME ─────────────────────────────
  .get("/:code/tickets", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });

    if (!game) {
      set.status = 404;
      return errorResponse("Game not found");
    }

    const tickets = await Ticket.find({
      game: game._id,
      user: currentUser._id,
    }).lean();

    return successResponse(
      {
        tickets: tickets.map((t) => ({
          id: t._id,
          grid: t.grid,
          markedNumbers: t.markedNumbers,
        })),
      },
      "Your tickets"
    );
  });
