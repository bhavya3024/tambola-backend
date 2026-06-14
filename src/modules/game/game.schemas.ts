import { t } from "elysia";
import {
  PLAYERS,
  NUMBER_CALL_INTERVAL,
  TICKETS_PER_PLAYER,
  WIN_PATTERN,
} from "../../config/constants";

/**
 * Validation schemas for game endpoints.
 */

export const createGameSchema = {
  body: t.Object({
    maxPlayers: t.Optional(t.Number({ minimum: PLAYERS.MIN, maximum: PLAYERS.MAX, default: PLAYERS.DEFAULT })),
    numberCallInterval: t.Optional(t.Number({ minimum: NUMBER_CALL_INTERVAL.MIN, maximum: NUMBER_CALL_INTERVAL.MAX, default: NUMBER_CALL_INTERVAL.DEFAULT })),
    ticketsPerPlayer: t.Optional(t.Number({ minimum: TICKETS_PER_PLAYER.MIN, maximum: TICKETS_PER_PLAYER.MAX, default: TICKETS_PER_PLAYER.DEFAULT })),
    availablePatterns: t.Optional(
      t.Array(
        t.Union([
          t.Literal(WIN_PATTERN.EARLY_FIVE),
          t.Literal(WIN_PATTERN.TOP_LINE),
          t.Literal(WIN_PATTERN.MIDDLE_LINE),
          t.Literal(WIN_PATTERN.BOTTOM_LINE),
          t.Literal(WIN_PATTERN.FULL_HOUSE),
        ]),
        { minItems: 1 }
      )
    ),
  }),
};
