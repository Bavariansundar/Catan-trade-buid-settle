import { hexKey, neighbors } from "../coordinates.js";
import type { BoardSpec } from "./generate.js";
import type { Board, HexTile, RuleError } from "../types.js";

export const RED_NUMBERS: ReadonlySet<number> = new Set([6, 8]);

/** True if any two board-adjacent tiles both carry a red number (6 or 8). */
export function hasAdjacentRedNumbers(tiles: readonly HexTile[]): boolean {
  const numberByHex = new Map<string, number>();
  for (const tile of tiles) {
    if (tile.number !== null) numberByHex.set(hexKey(tile.hex), tile.number);
  }
  for (const tile of tiles) {
    if (tile.number === null || !RED_NUMBERS.has(tile.number)) continue;
    for (const n of neighbors(tile.hex)) {
      const neighborNumber = numberByHex.get(hexKey(n));
      if (neighborNumber !== undefined && RED_NUMBERS.has(neighborNumber)) {
        return true;
      }
    }
  }
  return false;
}

function tally<T extends string | number>(items: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Every key present in either map, each mismatch between them reported once. */
function diffCounts<T extends string | number>(
  expected: Map<T, number>,
  actual: Map<T, number>,
  describe: (key: T, expectedCount: number, actualCount: number) => RuleError,
): RuleError[] {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const errors: RuleError[] = [];
  for (const key of keys) {
    const expectedCount = expected.get(key) ?? 0;
    const actualCount = actual.get(key) ?? 0;
    if (expectedCount !== actualCount) errors.push(describe(key, expectedCount, actualCount));
  }
  return errors;
}

/**
 * Validates a board generated from `spec` (see {@link BoardSpec}): tile/
 * token/harbor counts match the spec's bags, desert is numberless, no two
 * adjacent tiles carry a red number. Pure: does not throw, returns the list
 * of violations (empty = valid). Works for any board shape/size — the base
 * 19-hex board, the five-six-players extension, or any future module's
 * spec — since it derives its expectations from `spec` rather than
 * hardcoding them.
 */
export function validateBoard(board: Board, spec: BoardSpec): RuleError[] {
  const errors: RuleError[] = [];

  const expectedTerrainCounts = tally(spec.terrainBag);
  const actualTerrainCounts = tally(board.tiles.map((t) => t.terrain));
  errors.push(
    ...diffCounts(
      expectedTerrainCounts,
      actualTerrainCounts,
      (terrain, expected, actual): RuleError => ({
        code: "TERRAIN_COUNT_MISMATCH",
        message: `Expected ${String(expected)} ${terrain} tile(s), found ${String(actual)}`,
      }),
    ),
  );

  const numberCounts = new Map<number, number>();
  for (const tile of board.tiles) {
    if (tile.terrain === "desert") {
      if (tile.number !== null) {
        errors.push({
          code: "DESERT_HAS_NUMBER",
          message: `Desert tile at ${hexKey(tile.hex)} has a number token`,
        });
      }
      continue;
    }
    if (tile.number === null) {
      errors.push({
        code: "MISSING_NUMBER",
        message: `Non-desert tile at ${hexKey(tile.hex)} has no number token`,
      });
      continue;
    }
    if (tile.number === 7 || tile.number < 2 || tile.number > 12) {
      errors.push({
        code: "INVALID_NUMBER",
        message: `Tile at ${hexKey(tile.hex)} has invalid number ${String(tile.number)}`,
      });
      continue;
    }
    numberCounts.set(tile.number, (numberCounts.get(tile.number) ?? 0) + 1);
  }
  errors.push(
    ...diffCounts(tally(spec.numberBag), numberCounts, (number, expected, actual): RuleError => ({
      code: "NUMBER_COUNT_MISMATCH",
      message: `Expected ${String(expected)} tile(s) numbered ${String(number)}, found ${String(actual)}`,
    })),
  );

  if (hasAdjacentRedNumbers(board.tiles)) {
    errors.push({
      code: "ADJACENT_RED_NUMBERS",
      message: "Two adjacent tiles both carry a red number (6 or 8)",
    });
  }

  errors.push(
    ...diffCounts(
      tally(spec.harborTypes),
      tally(board.harbors.map((h) => h.type)),
      (type, expected, actual): RuleError => ({
        code: "HARBOR_COUNT_MISMATCH",
        message: `Expected ${String(expected)} ${type} harbor(s), found ${String(actual)}`,
      }),
    ),
  );

  return errors;
}
