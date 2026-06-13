import { t } from "elysia";

/**
 * Validation schemas for game endpoints.
 */

export const createGameSchema = {
  body: t.Object({
    maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 200, default: 50 })),
    numberCallInterval: t.Optional(t.Number({ minimum: 3, maximum: 30, default: 10 })),
    availablePatterns: t.Optional(
      t.Array(
        t.Union([
          t.Literal("earlyFive"),
          t.Literal("topLine"),
          t.Literal("middleLine"),
          t.Literal("bottomLine"),
          t.Literal("fullHouse"),
        ]),
        { minItems: 1 }
      )
    ),
  }),
};

export const generateTicketsSchema = {
  body: t.Object({
    count: t.Number({ minimum: 1, maximum: 6, default: 1 }),
  }),
};
