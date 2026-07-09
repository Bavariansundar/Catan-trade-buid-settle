import { describe, expect, it } from "vitest";
import { revealHexesTouching } from "./exploration.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const HIDDEN_HEX = { q: 3, r: 0 };
const OTHER_HIDDEN_HEX = { q: 4, r: 0 };

function withHidden() {
  return testGameState({
    hiddenHexes: new Map([
      ["3,0", true as const],
      ["4,0", true as const],
    ]),
    discoveryBag: [
      { terrain: "wood" as const, number: 9 },
      { terrain: "desert" as const, number: null },
    ],
  });
}

describe("revealHexesTouching", () => {
  it("is a no-op when none of the given hexes are hidden", () => {
    const state = testGameState();
    const result = revealHexesTouching(state, [TEST_HEX.center], "p1");
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it("reveals a hidden hex, adds it to board.tiles, and grants a free resource card", () => {
    const state = withHidden();
    const result = revealHexesTouching(state, [HIDDEN_HEX], "p1");
    expect(result.state.hiddenHexes.has("3,0")).toBe(false);
    const revealedTile = result.state.board.tiles.find(
      (t) => t.hex.q === HIDDEN_HEX.q && t.hex.r === HIDDEN_HEX.r,
    );
    expect(revealedTile).toEqual({ hex: HIDDEN_HEX, terrain: "wood", number: 9 });
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.wood).toBe(1);
    expect(result.state.discoveryBag).toHaveLength(1);
    const event = result.events.find((e) => e.type === "HEX_DISCOVERED");
    expect(event).toMatchObject({ playerId: "p1", terrain: "wood", number: 9 });
  });

  it("grants nothing for a revealed desert", () => {
    const state = withHidden();
    // Reveal HIDDEN_HEX first (consumes "wood" off the bag), then OTHER_HIDDEN_HEX (desert).
    const first = revealHexesTouching(state, [HIDDEN_HEX], "p1");
    const second = revealHexesTouching(first.state, [OTHER_HIDDEN_HEX], "p1");
    const p1 = second.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toEqual({ wood: 1, wheat: 0, sheep: 0, brick: 0, ore: 0 }); // unchanged from `first`
    const revealedTile = second.state.board.tiles.find(
      (t) => t.hex.q === OTHER_HIDDEN_HEX.q && t.hex.r === OTHER_HIDDEN_HEX.r,
    );
    expect(revealedTile).toEqual({ hex: OTHER_HIDDEN_HEX, terrain: "desert", number: null });
  });

  it("reveals multiple hexes in one call (e.g. both sides of an edge hidden)", () => {
    const state = withHidden();
    const result = revealHexesTouching(state, [HIDDEN_HEX, OTHER_HIDDEN_HEX], "p1");
    expect(result.state.hiddenHexes.size).toBe(0);
    expect(result.events).toHaveLength(2);
    expect(result.state.discoveryBag).toHaveLength(0);
  });

  it("only reveals the hexes that are actually still hidden, ignoring known ones", () => {
    const state = withHidden();
    const result = revealHexesTouching(state, [TEST_HEX.center, HIDDEN_HEX], "p1");
    expect(result.events).toHaveLength(1);
    expect(result.state.hiddenHexes.has("3,0")).toBe(false);
    expect(result.state.hiddenHexes.has("4,0")).toBe(true);
  });
});
