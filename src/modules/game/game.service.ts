import { Game, IGame, WinPattern } from "../../models/game.model";
import { Ticket } from "../../models/ticket.model";
import { Types } from "mongoose";
import {
  GAME_CODE,
  TOTAL_NUMBERS,
  WIN_PATTERN,
  EARLY_FIVE_COUNT,
  ROW_INDEX,
} from "../../config/constants";

/**
 * Generate a unique 6-character alphanumeric game code.
 */
export async function generateGameCode(): Promise<string> {
  const chars = GAME_CODE.CHARSET;
  let code: string;
  let attempts = 0;

  do {
    code = "";
    for (let i = 0; i < GAME_CODE.LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    attempts++;
    // Ensure uniqueness
    const existing = await Game.findOne({ code });
    if (!existing) break;
  } while (attempts < GAME_CODE.MAX_GENERATION_ATTEMPTS);

  return code;
}

/**
 * Validate a player's claim against the called numbers and their ticket.
 * Returns true if the claim is valid.
 */
export function validateClaim(
  pattern: WinPattern,
  ticketGrid: number[][],
  calledNumbers: number[]
): boolean {
  const calledSet = new Set(calledNumbers);

  switch (pattern) {
    case WIN_PATTERN.EARLY_FIVE: {
      // First 5 numbers on the ticket that have been called
      let count = 0;
      for (const row of ticketGrid) {
        for (const num of row) {
          if (num > 0 && calledSet.has(num)) {
            count++;
          }
        }
      }
      return count >= EARLY_FIVE_COUNT;
    }

    case WIN_PATTERN.TOP_LINE:
      return ticketGrid[ROW_INDEX.TOP]
        .filter((n) => n > 0)
        .every((n) => calledSet.has(n));

    case WIN_PATTERN.MIDDLE_LINE:
      return ticketGrid[ROW_INDEX.MIDDLE]
        .filter((n) => n > 0)
        .every((n) => calledSet.has(n));

    case WIN_PATTERN.BOTTOM_LINE:
      return ticketGrid[ROW_INDEX.BOTTOM]
        .filter((n) => n > 0)
        .every((n) => calledSet.has(n));

    case WIN_PATTERN.FULL_HOUSE: {
      // All 15 numbers must be called
      for (const row of ticketGrid) {
        for (const num of row) {
          if (num > 0 && !calledSet.has(num)) {
            return false;
          }
        }
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Check if the game is fully completed (all patterns claimed).
 */
export function isGameComplete(game: IGame): boolean {
  return game.availablePatterns.every(
    (pattern) => game.winners[pattern] != null
  );
}

/**
 * Draw the next random number from the remaining pool (1-90).
 */
export function drawNextNumber(calledNumbers: number[]): number | null {
  const calledSet = new Set(calledNumbers);
  const remaining: number[] = [];

  for (let i = 1; i <= TOTAL_NUMBERS; i++) {
    if (!calledSet.has(i)) {
      remaining.push(i);
    }
  }

  if (remaining.length === 0) return null;

  const index = Math.floor(Math.random() * remaining.length);
  return remaining[index];
}