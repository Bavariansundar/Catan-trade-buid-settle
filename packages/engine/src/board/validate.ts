import { hexKey, neighbors } from "../coordinates.js";
import type { Board, HarborType, HexTile, RuleError, TerrainType } from "../types.js";

const EXPECTED_TERRAIN_COUNTS: Record<TerrainType, number> = {
  wood: 4,
  wheat: 4,
  sheep: 4,
  brick: 3,
  ore: 3,
  desert: 1,
};

const EXPECTED_NUMBER_COUNTS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  8: 2,
  9: 2,
  10: 2,
  11: 2,
  12: 1,
};

const EXPECTED_HARBOR_COUNTS: Record<HarborType, number> = {
  generic: 4,
  wood: 1,
  wheat: 1,
  sheep: 1,
  brick: 1,
  ore: 1,
};

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

/**
 * Validates a base-module board against CLAUDE.md's invariants. Pure: does
 * not throw, returns the list of violations (empty = valid).
 */
export function validateBoard(board: Board): RuleError[] {
  const errors: RuleError[] = [];

  const terrainCounts: Partial<Record<TerrainType, number>> = {};
  for (const tile of board.tiles) {
    terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] ?? 0) + 1;
  }
  for (const terrain of Object.keys(EXPECTED_TERRAIN_COUNTS) as TerrainType[]) {
    const expected = EXPECTED_TERRAIN_COUNTS[terrain];
    const actual = terrainCounts[terrain] ?? 0;
    if (actual !== expected) {
      errors.push({
        code: "TERRAIN_COUNT_MISMATCH",
        message: `Expected ${String(expected)} ${terrain} tile(s), found ${String(actual)}`,
      });
    }
  }

  const numberCounts: Partial<Record<number, number>> = {};
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
    numberCounts[tile.number] = (numberCounts[tile.number] ?? 0) + 1;
  }
  for (const numberKey of Object.keys(EXPECTED_NUMBER_COUNTS)) {
    const number = Number(numberKey);
    const expected = EXPECTED_NUMBER_COUNTS[number];
    const actual = numberCounts[number] ?? 0;
    if (actual !== expected) {
      errors.push({
        code: "NUMBER_COUNT_MISMATCH",
        message: `Expected ${String(expected)} tile(s) numbered ${String(number)}, found ${String(actual)}`,
      });
    }
  }

  if (hasAdjacentRedNumbers(board.tiles)) {
    errors.push({
      code: "ADJACENT_RED_NUMBERS",
      message: "Two adjacent tiles both carry a red number (6 or 8)",
    });
  }

  const harborCounts: Partial<Record<HarborType, number>> = {};
  for (const harbor of board.harbors) {
    harborCounts[harbor.type] = (harborCounts[harbor.type] ?? 0) + 1;
  }
  for (const type of Object.keys(EXPECTED_HARBOR_COUNTS) as HarborType[]) {
    const expected = EXPECTED_HARBOR_COUNTS[type];
    const actual = harborCounts[type] ?? 0;
    if (actual !== expected) {
      errors.push({
        code: "HARBOR_COUNT_MISMATCH",
        message: `Expected ${String(expected)} ${type} harbor(s), found ${String(actual)}`,
      });
    }
  }

  return errors;
}
