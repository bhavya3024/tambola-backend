/**
 * Tambola Ticket Generator
 *
 * Rules:
 * - 3x9 grid (3 rows, 9 columns)
 * - Each ticket has exactly 15 numbers and 12 blanks
 * - Each row has exactly 5 numbers and 4 blanks
 * - Column ranges: Col0=1-9, Col1=10-19, ..., Col8=80-90
 * - Numbers within each column are sorted ascending
 * - Each column has at least 1 and at most 3 numbers
 */

import {
  COLUMN_RANGES,
  TICKET_GRID,
  TICKET_GEN_MAX_ITERATIONS,
} from "../../config/constants";

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateTicket(): number[][] {
  const colCounts = new Array(TICKET_GRID.COLS).fill(1);
  let remaining = TICKET_GRID.TOTAL_NUMBERS - TICKET_GRID.COLS; // 15 - 9 = 6
  const colIndices = shuffle(Array.from({ length: TICKET_GRID.COLS }, (_, i) => i));

  for (const colIdx of colIndices) {
    if (remaining <= 0) break;
    const canAdd = Math.min(2, remaining);
    const toAdd = Math.floor(Math.random() * canAdd) + 1;
    colCounts[colIdx] += toAdd;
    remaining -= toAdd;
  }

  while (remaining > 0) {
    for (let c = 0; c < TICKET_GRID.COLS && remaining > 0; c++) {
      if (colCounts[c] < TICKET_GRID.ROWS) { colCounts[c]++; remaining--; }
    }
  }

  const colNumbers: number[][] = [];
  for (let c = 0; c < TICKET_GRID.COLS; c++) {
    const [min, max] = COLUMN_RANGES[c];
    const pool: number[] = [];
    for (let n = min; n <= max; n++) pool.push(n);
    shuffle(pool);
    colNumbers.push(pool.slice(0, colCounts[c]).sort((a, b) => a - b));
  }

  const grid: number[][] = Array.from({ length: TICKET_GRID.ROWS }, () => new Array(TICKET_GRID.COLS).fill(0));
  const rowCounts = new Array(TICKET_GRID.ROWS).fill(0);
  const colRowAssignments: number[][] = [];

  for (let c = 0; c < TICKET_GRID.COLS; c++) {
    const count = colCounts[c];
    if (count === TICKET_GRID.ROWS) { colRowAssignments.push(Array.from({ length: TICKET_GRID.ROWS }, (_, i) => i)); }
    else if (count === 2) { colRowAssignments.push(shuffle(Array.from({ length: TICKET_GRID.ROWS }, (_, i) => i)).slice(0, 2).sort()); }
    else { colRowAssignments.push([Math.floor(Math.random() * TICKET_GRID.ROWS)]); }
  }

  for (let c = 0; c < TICKET_GRID.COLS; c++) {
    for (const r of colRowAssignments[c]) { rowCounts[r]++; }
  }

  let iteration = 0;

  while (!rowCounts.every((c) => c === TICKET_GRID.NUMBERS_PER_ROW) && iteration < TICKET_GEN_MAX_ITERATIONS) {
    iteration++;
    let overRow = -1, underRow = -1;
    for (let r = 0; r < TICKET_GRID.ROWS; r++) {
      if (rowCounts[r] > TICKET_GRID.NUMBERS_PER_ROW) overRow = r;
      if (rowCounts[r] < TICKET_GRID.NUMBERS_PER_ROW) underRow = r;
    }
    if (overRow === -1 || underRow === -1) break;

    const candidates = shuffle(Array.from({ length: TICKET_GRID.COLS }, (_, i) => i));
    let swapped = false;
    for (const c of candidates) {
      const rows = colRowAssignments[c];
      if (rows.includes(overRow) && !rows.includes(underRow) && colCounts[c] < TICKET_GRID.ROWS) {
        const idx = rows.indexOf(overRow);
        rows[idx] = underRow;
        rowCounts[overRow]--;
        rowCounts[underRow]++;
        swapped = true;
        break;
      }
    }
    if (!swapped) {
      for (const c of candidates) {
        const rows = colRowAssignments[c];
        if (rows.includes(overRow) && !rows.includes(underRow)) {
          const idx = rows.indexOf(overRow);
          rows[idx] = underRow;
          rowCounts[overRow]--;
          rowCounts[underRow]++;
          break;
        }
      }
    }
  }

  if (!rowCounts.every((c) => c === TICKET_GRID.NUMBERS_PER_ROW)) {
    return generateTicket();
  }

  for (let c = 0; c < TICKET_GRID.COLS; c++) {
    const rows = colRowAssignments[c].sort();
    const numbers = colNumbers[c];
    for (let i = 0; i < rows.length; i++) { grid[rows[i]][c] = numbers[i]; }
  }

  return grid;
}

export function generateTickets(count: number): number[][][] {
  const tickets: number[][][] = [];
  for (let i = 0; i < count; i++) { tickets.push(generateTicket()); }
  return tickets;
}
