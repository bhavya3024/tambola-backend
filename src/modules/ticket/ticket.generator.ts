/**
 * Tambola Ticket Generator
 *
 * Rules:
 * - 3×9 grid (3 rows, 9 columns)
 * - Each ticket has exactly 15 numbers and 12 blanks
 * - Each row has exactly 5 numbers and 4 blanks
 * - Column ranges: Col0=1-9, Col1=10-19, ..., Col8=80-90
 * - Numbers within each column are sorted ascending
 * - Each column has at least 1 and at most 3 numbers
 */

// Column ranges: col 0 = 1-9, col 1 = 10-19, ..., col 8 = 80-90
const COLUMN_RANGES: [number, number][] = [
  [1, 9],
  [10, 19],
  [20, 29],
  [30, 39],
  [40, 49],
  [50, 59],
  [60, 69],
  [70, 79],
  [80, 90],
];

/**
 * Shuffle array in place (Fisher-Yates).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a single valid Tambola ticket.
 * Returns a 3×9 grid where 0 means blank.
 */
export function generateTicket(): number[][] {
  // Step 1: Decide how many numbers per column (1, 2, or 3)
  // Total must be 15. Each column gets at least 1.
  // Start with 1 per column = 9, need 6 more distributed among 9 columns (max 3 each)
  const colCounts = new Array(9).fill(1); // Start with 1 per column
  let remaining = 6; // 15 - 9 = 6 more to distribute

  const colIndices = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  for (const colIdx of colIndices) {
    if (remaining <= 0) break;
    const canAdd = Math.min(2, remaining); // max 2 more (since already 1)
    const toAdd = Math.floor(Math.random() * canAdd) + 1;
    colCounts[colIdx] += toAdd;
    remaining -= toAdd;
  }

  // If there's still remaining, distribute one at a time
  while (remaining > 0) {
    for (let c = 0; c < 9 && remaining > 0; c++) {
      if (colCounts[c] < 3) {
        colCounts[c]++;
        remaining--;
      }
    }
  }

  // Step 2: Pick random numbers from each column's range
  const colNumbers: number[][] = [];
  for (let c = 0; c < 9; c++) {
    const [min, max] = COLUMN_RANGES[c];
    const pool: number[] = [];
    for (let n = min; n <= max; n++) pool.push(n);
    shuffle(pool);
    const picked = pool.slice(0, colCounts[c]).sort((a, b) => a - b);
    colNumbers.push(picked);
  }

  // Step 3: Create grid and place numbers ensuring each row has exactly 5
  const grid: number[][] = [
    new Array(9).fill(0),
    new Array(9).fill(0),
    new Array(9).fill(0),
  ];

  // For columns with 3 numbers: all rows get a number
  // For columns with 2 numbers: pick 2 rows
  // For columns with 1 number: pick 1 row

  // Track how many numbers each row currently has
  const rowCounts = [0, 0, 0];

  // Assign rows to each column's numbers
  const colRowAssignments: number[][] = [];

  for (let c = 0; c < 9; c++) {
    const count = colCounts[c];
    if (count === 3) {
      colRowAssignments.push([0, 1, 2]);
    } else if (count === 2) {
      // Pick 2 of 3 rows
      const rows = shuffle([0, 1, 2]).slice(0, 2).sort();
      colRowAssignments.push(rows);
    } else {
      // Pick 1 of 3 rows
      const row = Math.floor(Math.random() * 3);
      colRowAssignments.push([row]);
    }
  }

  // Now we need to adjust to ensure each row has exactly 5 numbers
  // Count numbers per row
  for (let c = 0; c < 9; c++) {
    for (const r of colRowAssignments[c]) {
      rowCounts[r]++;
    }
  }

  // Iteratively fix rows that don't have exactly 5
  // This is a constraint satisfaction problem; we use swap-based repair
  const MAX_ITERATIONS = 1000;
  let iteration = 0;

  while (
    (rowCounts[0] !== 5 || rowCounts[1] !== 5 || rowCounts[2] !== 5) &&
    iteration < MAX_ITERATIONS
  ) {
    iteration++;

    // Find a row that's over 5 and a row that's under 5
    let overRow = -1;
    let underRow = -1;

    for (let r = 0; r < 3; r++) {
      if (rowCounts[r] > 5) overRow = r;
      if (rowCounts[r] < 5) underRow = r;
    }

    if (overRow === -1 || underRow === -1) break;

    // Find a column where overRow has a number but underRow doesn't,
    // and the column count allows the swap
    const candidates = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    let swapped = false;

    for (const c of candidates) {
      const rows = colRowAssignments[c];
      if (rows.includes(overRow) && !rows.includes(underRow) && colCounts[c] < 3) {
        // Can't add to column if it already has max, so just swap the row
        const idx = rows.indexOf(overRow);
        rows[idx] = underRow;
        rowCounts[overRow]--;
        rowCounts[underRow]++;
        swapped = true;
        break;
      }
    }

    // If simple swap didn't work, try a different strategy
    if (!swapped) {
      // Find a column that has a number in overRow and also has room to swap
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

  // If we still can't satisfy constraints, regenerate (rare)
  if (rowCounts[0] !== 5 || rowCounts[1] !== 5 || rowCounts[2] !== 5) {
    return generateTicket();
  }

  // Step 4: Place numbers in the grid
  for (let c = 0; c < 9; c++) {
    const rows = colRowAssignments[c].sort();
    const numbers = colNumbers[c];
    for (let i = 0; i < rows.length; i++) {
      grid[rows[i]][c] = numbers[i];
    }
  }

  return grid;
}

/**
 * Generate multiple unique tickets.
 */
export function generateTickets(count: number): number[][][] {
  const tickets: number[][][] = [];
  for (let i = 0; i < count; i++) {
    tickets.push(generateTicket());
  }
  return tickets;
}
