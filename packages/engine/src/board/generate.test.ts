import { describe, expect, it } from "vitest";
import { validateBoard } from "./validate.js";
import { BASE_BOARD_SPEC, generateBoard } from "./generate.js";

describe("generateBoard", () => {
  it("produces a board with 19 tiles and 9 harbors", () => {
    const board = generateBoard(BASE_BOARD_SPEC, { seed: 1 });
    expect(board.tiles).toHaveLength(19);
    expect(board.harbors).toHaveLength(9);
  });

  it("produces a board that passes validateBoard (legal board)", () => {
    for (const seed of [0, 1, 2, 3, 42, "hexhaven", "another-seed"]) {
      const board = generateBoard(BASE_BOARD_SPEC, { seed });
      expect(validateBoard(board, BASE_BOARD_SPEC)).toEqual([]);
    }
  });

  it("is deterministic for a given seed", () => {
    const boardA = generateBoard(BASE_BOARD_SPEC, { seed: "reproducible" });
    const boardB = generateBoard(BASE_BOARD_SPEC, { seed: "reproducible" });
    expect(boardA).toEqual(boardB);
  });

  it("gives the desert tile no number and every other tile a number", () => {
    const board = generateBoard(BASE_BOARD_SPEC, { seed: 5 });
    for (const tile of board.tiles) {
      if (tile.terrain === "desert") {
        expect(tile.number).toBeNull();
      } else {
        expect(tile.number).not.toBeNull();
      }
    }
  });

  it("never places two adjacent tiles both numbered 6 or 8", () => {
    for (let seed = 0; seed < 200; seed++) {
      const board = generateBoard(BASE_BOARD_SPEC, { seed });
      const errors = validateBoard(board, BASE_BOARD_SPEC);
      const adjacencyErrors = errors.filter((e) => e.code === "ADJACENT_RED_NUMBERS");
      expect(adjacencyErrors).toEqual([]);
    }
  });
});
