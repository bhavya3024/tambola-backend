import { Elysia } from "elysia";
import { authGuard } from "../auth/auth.guard";
import { Game } from "../../models/game.model";
import { Ticket } from "../../models/ticket.model";
import { successResponse, errorResponse } from "../../utils/response";

export const ticketController = new Elysia({ prefix: "/games" })
  .use(authGuard)

  .get("/:code/tickets", async ({ params, currentUser, set }) => {
    const game = await Game.findOne({ code: params.code.toUpperCase() });
    if (!game) { set.status = 404; return errorResponse("Game not found"); }
    const tickets = await Ticket.find({ game: game._id, user: currentUser._id }).lean();
    return successResponse(
      { tickets: tickets.map((t) => ({ id: t._id, grid: t.grid, markedNumbers: t.markedNumbers })) },
      "Your tickets"
    );
  });