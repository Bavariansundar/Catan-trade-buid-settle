import { BASE_MODULE, createGame, type GameState } from "@baychearsbar/engine";

const CENTER_HEX = { q: 0, r: 0 };

/**
 * A real, fully-valid `GameState` (built via the actual engine, not a
 * hand-rolled fixture) for unit-testing bot-side pure functions in
 * isolation — buildings/robber reset to a clean slate by default so tests
 * can place exactly what they need. Optionally overrides the center hex's
 * terrain/number for tests that need to compare production values.
 */
export function testGameStateForBots(
  overrides: Partial<GameState> = {},
  centerHexOverride?: { number: number },
): GameState {
  const base = createGame([BASE_MODULE], { playerIds: ["p1", "p2"], seed: "bots-test-fixture" });
  const desertHex = base.board.tiles.find((t) => t.terrain === "desert")!.hex;

  let board = base.board;
  if (centerHexOverride) {
    board = {
      ...base.board,
      tiles: base.board.tiles.map((t) =>
        t.hex.q === CENTER_HEX.q && t.hex.r === CENTER_HEX.r
          ? { ...t, terrain: "wood" as const, number: centerHexOverride.number }
          : t,
      ),
    };
  }

  return {
    ...base,
    board,
    buildings: new Map(),
    robber: desertHex,
    phase: { name: "main" },
    ...overrides,
  };
}
