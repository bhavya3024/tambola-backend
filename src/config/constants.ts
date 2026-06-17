/**
 * Application-wide constants.
 * Centralises magic numbers, strings, and configuration values
 * so they live in a single, easily auditable file.
 */

// ─── Server ──────────────────────────────────────────────────

/** Default server port */
export const DEFAULT_PORT = 3000;

/** Default MongoDB connection string */
export const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/tambola";

// ─── Auth / JWT ──────────────────────────────────────────────

/** Default JWT access-token expiry */
export const DEFAULT_JWT_EXPIRY = "15m";

/** Default refresh-token expiry */
export const DEFAULT_REFRESH_EXPIRY = "7d";

/** Fallback for parseExpiry when the format is unrecognised (seconds) */
export const DEFAULT_EXPIRY_SECONDS = 900; // 15 min

/** Argon2id hashing parameters for passwords */
export const PASSWORD_HASH = {
  ALGORITHM: "argon2id" as const,
  MEMORY_COST: 65536,
  TIME_COST: 2,
};

/** Email-verification token lifetime (ms) — 24 hours */
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Password-reset token lifetime (ms) — 1 hour */
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

/** Username constraints */
export const USERNAME = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 20,
  PATTERN: "^[a-zA-Z0-9_]+$",
};

/** Password constraints */
export const PASSWORD = {
  MIN_LENGTH: 6,
  MAX_LENGTH: 128,
};

/** Display-name constraints */
export const DISPLAY_NAME = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 50,
};

// ─── Email ───────────────────────────────────────────────────

/** Default sender for outgoing emails */
export const DEFAULT_EMAIL_FROM = "Tambola <noreply@bhavya-dhiman.dev>";

// ─── Frontend ────────────────────────────────────────────────

/** Default frontend URL (for email links, CORS, etc.) */
export const DEFAULT_FRONTEND_URL = "http://localhost:5173";

// ─── Game Status ─────────────────────────────────────────────

/** Game lifecycle statuses */
export const GAME_STATUS = {
  WAITING: "waiting",
  IN_PROGRESS: "in_progress",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;

/** All valid game statuses (for validation checks) */
export const ALL_GAME_STATUSES = Object.values(GAME_STATUS);

// ─── Win Patterns ────────────────────────────────────────────

/** Win pattern identifiers */
export const WIN_PATTERN = {
  EARLY_FIVE: "earlyFive",
  TOP_LINE: "topLine",
  MIDDLE_LINE: "middleLine",
  BOTTOM_LINE: "bottomLine",
  FULL_HOUSE: "fullHouse",
} as const;

/** All available win patterns */
export const ALL_PATTERNS = Object.values(WIN_PATTERN);

/** Number of matches required for earlyFive pattern */
export const EARLY_FIVE_COUNT = 5;

/** Row indices used in line-based claims */
export const ROW_INDEX = {
  TOP: 0,
  MIDDLE: 1,
  BOTTOM: 2,
} as const;

// ─── WebSocket Events ────────────────────────────────────────

/** Client → Server action types */
export const WS_ACTION = {
  START_GAME: "start_game",
  PAUSE_GAME: "pause_game",
  RESUME_GAME: "resume_game",
  CLAIM: "claim",
} as const;

/** Server → Client broadcast event types */
export const WS_EVENT = {
  GAME_STATE: "game_state",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT: "player_left",
  GAME_STARTED: "game_started",
  GAME_PAUSED: "game_paused",
  GAME_RESUMED: "game_resumed",
  NUMBER_CALLED: "number_called",
  CLAIM_RESULT: "claim_result",
  GAME_ENDED: "game_ended",
  ERROR: "error",
} as const;

// ─── Game ────────────────────────────────────────────────────

/** Total numbers on the Tambola board (1 – 90) */
export const TOTAL_NUMBERS = 90;

/** Game-code generation */
export const GAME_CODE = {
  LENGTH: 6,
  /** Characters used (omits confusing chars: 0, O, 1, I) */
  CHARSET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  MAX_GENERATION_ATTEMPTS: 10,
};

/** Player limits */
export const PLAYERS = {
  MIN: 2,
  MAX: 200,
  DEFAULT: 50,
};

/** Number-call interval (seconds) */
export const NUMBER_CALL_INTERVAL = {
  MIN: 3,
  MAX: 30,
  DEFAULT: 10,
};

/** Tickets-per-player limits */
export const TICKETS_PER_PLAYER = {
  MIN: 1,
  MAX: 6,
  DEFAULT: 1,
};

// ─── Pagination ──────────────────────────────────────────────

/** Default page sizes for list endpoints */
export const PAGINATION = {
  GAMES_LIST: 10,
  GAME_HISTORY: 20,
};

// ─── Ticket grid ─────────────────────────────────────────────

/** Ticket dimensions */
export const TICKET_GRID = {
  ROWS: 3,
  COLS: 9,
  NUMBERS_PER_ROW: 5,
  TOTAL_NUMBERS: 15, // ROWS × NUMBERS_PER_ROW
  BLANKS_PER_ROW: 4, // COLS − NUMBERS_PER_ROW
  TOTAL_BLANKS: 12,  // ROWS × BLANKS_PER_ROW
};

/** Column ranges for ticket generation (inclusive) */
export const COLUMN_RANGES: [number, number][] = [
  [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
  [50, 59], [60, 69], [70, 79], [80, 90],
];

/** Max iterations for the row-balancing loop in ticket generation */
export const TICKET_GEN_MAX_ITERATIONS = 1000;
