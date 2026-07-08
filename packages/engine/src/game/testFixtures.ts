import { createRngFromState } from "../rng.js";
import type { Hex } from "../coordinates.js";
import type { Board, PlayerId } from "../types.js";
import { DEV_CARD_DECK } from "./devCards.js";
import { emptyHand, PIECE_LIMITS, STARTING_BANK } from "./resources.js";
import type { GameState, Player } from "./types.js";

// Explicit hex coordinates (see AXIAL_DIRECTIONS in coordinates.ts) — not
// derived from hexesWithinRadius, whose output order is sorted by (q, r)
// rather than by direction.
export const TEST_HEX = {
  center: { q: 0, r: 0 } as Hex,
  e: { q: 1, r: 0 } as Hex,
  ne: { q: 1, r: -1 } as Hex,
  nw: { q: 0, r: -1 } as Hex,
  w: { q: -1, r: 0 } as Hex,
  sw: { q: -1, r: 1 } as Hex,
  se: { q: 0, r: 1 } as Hex,
};

/**
 * A small, fully controlled 7-hex board (radius 1) for unit-testing turn
 * rules (production, robber, building) in isolation from board generation.
 * Deliberately does NOT satisfy generateBoard's invariants (e.g. adjacent
 * red numbers) — it's not meant to pass validateBoard, just to give tests
 * fixed, known terrain/numbers/geometry to assert against.
 */
export function testBoard(): Board {
  return {
    tiles: [
      { hex: TEST_HEX.center, terrain: "ore", number: 5 },
      { hex: TEST_HEX.e, terrain: "wood", number: 8 },
      { hex: TEST_HEX.ne, terrain: "wheat", number: 6 },
      { hex: TEST_HEX.nw, terrain: "sheep", number: 4 },
      { hex: TEST_HEX.w, terrain: "brick", number: 3 },
      { hex: TEST_HEX.sw, terrain: "desert", number: null },
      { hex: TEST_HEX.se, terrain: "wood", number: 10 },
    ],
    harbors: [],
  };
}

export function testDesertHex(): Hex {
  return testBoard().tiles.find((t) => t.terrain === "desert")!.hex;
}

export function testPlayer(id: PlayerId): Player {
  return {
    id,
    hand: emptyHand(),
    pieces: { ...PIECE_LIMITS },
    devCards: [],
    knightsPlayed: 0,
    devCardPlayedThisTurn: false,
  };
}

/** A ready-to-build-on 2-player game state, past setup, in the main phase. */
export function testGameState(overrides: Partial<GameState> = {}): GameState {
  const playerIds: PlayerId[] = ["p1", "p2"];
  return {
    board: testBoard(),
    players: playerIds.map(testPlayer),
    bank: { ...STARTING_BANK },
    buildings: new Map(),
    roads: new Map(),
    robber: testDesertHex(),
    currentPlayerIndex: 0,
    phase: { name: "main" },
    rngState: 12345,
    diceRoll: null,
    devDeck: [...DEV_CARD_DECK],
    tradeOffers: new Map(),
    nextTradeId: 0,
    turnNumber: 1,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    targetVictoryPoints: 10,
    ...overrides,
  };
}

/**
 * Finds an rngState whose first two `int(1, 7)` draws sum to `total` — lets
 * dice-roll tests pin down a specific outcome (e.g. a 7) deterministically
 * without needing to hand-derive mulberry32 internals.
 */
export function findRngStateForDiceTotal(total: number): number {
  for (let candidate = 0; candidate < 100_000; candidate++) {
    const rng = createRngFromState(candidate);
    const roll = rng.int(1, 7) + rng.int(1, 7);
    if (roll === total) return candidate;
  }
  throw new Error(`No rngState found producing dice total ${String(total)}`);
}
