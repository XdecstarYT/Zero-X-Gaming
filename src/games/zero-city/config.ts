/** Rename the game here: every screen, the logo and the saves read this. */
export const GAME_NAME = "Zero City";
export const GAME_SLUG = "zero-city";
export const VERSION = "0.9";
/** Save format version; bump it and add a migration in save.ts. */
export const SAVE_VERSION = 1;

/** World scale: the heightfield is CELLS × CELLS cells of CELL metres, split into CHUNK × CHUNK cell chunks. */
export const CELL = 8;
export const CELLS = 256;
export const CHUNK = 64;
export const WORLD = CELL * CELLS;
export const WATER_LEVEL = 0;

/** Simulation ticks per second (the renderer interpolates between them). */
export const TICK_HZ = 10;
/** One real second at 1× is this many game minutes. */
export const GAME_MINUTES_PER_SECOND = 1;
export const AUTOSAVE_MS = 2 * 60_000;
export const UNDO_LIMIT = 50;
/** Lots are measured in units of this many metres (the steppers). */
export const LOT_UNIT = 8;
