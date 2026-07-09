import { describe, expect, it } from "vitest";
import { BASE_BOARD_SPEC, generateBoard } from "./generate.js";
import { validateBoard } from "./validate.js";

const BOARD_COUNT = 10_000;

describe("generateBoard property test (10,000 boards)", () => {
  it("every generated board satisfies all invariants and layouts vary seed to seed", () => {
    let previousTerrainSignature: string | null = null;
    let identicalConsecutivePairs = 0;

    for (let seed = 0; seed < BOARD_COUNT; seed++) {
      const board = generateBoard(BASE_BOARD_SPEC, { seed });

      const errors = validateBoard(board, BASE_BOARD_SPEC);
      if (errors.length > 0) {
        throw new Error(
          `Board for seed ${String(seed)} failed validation: ${JSON.stringify(errors)}`,
        );
      }

      expect(board.tiles).toHaveLength(19);
      expect(board.harbors).toHaveLength(9);

      const terrainSignature = board.tiles.map((t) => `${t.terrain}:${String(t.number)}`).join(",");
      if (terrainSignature === previousTerrainSignature) {
        identicalConsecutivePairs++;
      }
      previousTerrainSignature = terrainSignature;
    }

    // Statistical spread: consecutive seeds should essentially never produce
    // byte-identical layouts across 10,000 boards.
    expect(identicalConsecutivePairs).toBe(0);
  }, 30_000);

  it("produces a healthy spread of distinct layouts across 10,000 seeds", () => {
    const signatures = new Set<string>();
    for (let seed = 0; seed < BOARD_COUNT; seed++) {
      const board = generateBoard(BASE_BOARD_SPEC, { seed });
      signatures.add(board.tiles.map((t) => `${t.terrain}:${String(t.number)}`).join(","));
    }
    // With 19!/(4!4!4!3!3!1!) * (18 numbers arrangements) possible layouts,
    // 10,000 draws should produce overwhelmingly distinct results.
    expect(signatures.size).toBeGreaterThan(BOARD_COUNT * 0.99);
  }, 30_000);
});
