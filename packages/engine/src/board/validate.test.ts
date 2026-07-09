import { describe, expect, it } from "vitest";
import { BASE_BOARD_SPEC, generateBoard } from "./generate.js";
import { validateBoard } from "./validate.js";
import type { Board, HexTile } from "../types.js";

function validBoard(): Board {
  return generateBoard(BASE_BOARD_SPEC, { seed: "validator-fixture" });
}

describe("validateBoard — legal boards", () => {
  it("returns no errors for a freshly generated board", () => {
    expect(validateBoard(validBoard(), BASE_BOARD_SPEC)).toEqual([]);
  });
});

describe("validateBoard — illegal boards", () => {
  it("flags wrong terrain counts", () => {
    const board = validBoard();
    const tiles: HexTile[] = board.tiles.map((tile, i) =>
      i === 0 ? { ...tile, terrain: "wood" } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "TERRAIN_COUNT_MISMATCH")).toBe(true);
  });

  it("flags a desert tile that has a number token", () => {
    const board = validBoard();
    const tiles: HexTile[] = board.tiles.map((tile) =>
      tile.terrain === "desert" ? { ...tile, number: 6 } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "DESERT_HAS_NUMBER")).toBe(true);
  });

  it("flags a non-desert tile missing its number token", () => {
    const board = validBoard();
    const target = board.tiles.find((t) => t.terrain !== "desert")!;
    const tiles: HexTile[] = board.tiles.map((tile) =>
      tile === target ? { ...tile, number: null } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "MISSING_NUMBER")).toBe(true);
  });

  it("flags a tile numbered 7", () => {
    const board = validBoard();
    const target = board.tiles.find((t) => t.terrain !== "desert")!;
    const tiles: HexTile[] = board.tiles.map((tile) =>
      tile === target ? { ...tile, number: 7 } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "INVALID_NUMBER")).toBe(true);
  });

  it("flags wrong number-token counts", () => {
    const board = validBoard();
    // Bump every "2" tile up to "3", breaking both counts.
    const tiles: HexTile[] = board.tiles.map((tile) =>
      tile.number === 2 ? { ...tile, number: 3 } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "NUMBER_COUNT_MISMATCH")).toBe(true);
  });

  it("flags two adjacent tiles both numbered red (6/8)", () => {
    const board = validBoard();
    // Find a tile numbered 6 or 8, then force one of its neighbors to match.
    const redHexKeys = new Set(
      board.tiles
        .filter((t) => t.number === 6 || t.number === 8)
        .map((t) => `${t.hex.q},${t.hex.r}`),
    );
    const target = board.tiles.find(
      (t) =>
        (t.number === 6 || t.number === 8) === false &&
        t.terrain !== "desert" &&
        [
          { q: t.hex.q + 1, r: t.hex.r },
          { q: t.hex.q + 1, r: t.hex.r - 1 },
          { q: t.hex.q, r: t.hex.r - 1 },
          { q: t.hex.q - 1, r: t.hex.r },
          { q: t.hex.q - 1, r: t.hex.r + 1 },
          { q: t.hex.q, r: t.hex.r + 1 },
        ].some((n) => redHexKeys.has(`${n.q},${n.r}`)),
    );
    expect(target).toBeDefined();
    const forcedNumber = target!.number === 6 ? 8 : 6;
    const tiles: HexTile[] = board.tiles.map((tile) =>
      tile === target ? { ...tile, number: forcedNumber } : tile,
    );
    const errors = validateBoard({ ...board, tiles }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "ADJACENT_RED_NUMBERS")).toBe(true);
  });

  it("flags wrong harbor counts", () => {
    const board = validBoard();
    const harbors = board.harbors.slice(1); // drop one harbor
    const errors = validateBoard({ ...board, harbors }, BASE_BOARD_SPEC);
    expect(errors.some((e) => e.code === "HARBOR_COUNT_MISMATCH")).toBe(true);
  });
});
