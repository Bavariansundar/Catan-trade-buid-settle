import { describe, expect, it } from "vitest";
import { recomputeLargestArmy } from "./largestArmy.js";
import { testGameState } from "./testFixtures.js";
import type { GameState } from "./types.js";

function stateWithKnights(counts: Record<string, number>, holder: string | null): GameState {
  const state = testGameState({ largestArmyPlayerId: holder });
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, knightsPlayed: counts[p.id] ?? 0 })),
  };
}

describe("recomputeLargestArmy", () => {
  it("is vacant below the 3-knight minimum", () => {
    const state = stateWithKnights({ p1: 2 }, null);
    expect(recomputeLargestArmy(state)).toBeNull();
  });

  it("awards a vacant title to the unique player reaching 3+", () => {
    const state = stateWithKnights({ p1: 3 }, null);
    expect(recomputeLargestArmy(state)).toBe("p1");
  });

  it("leaves a vacant title unclaimed on a tie", () => {
    const state = stateWithKnights({ p1: 3, p2: 3 }, null);
    expect(recomputeLargestArmy(state)).toBeNull();
  });

  it("keeps the current holder when nobody strictly exceeds them", () => {
    const state = stateWithKnights({ p1: 4, p2: 4 }, "p1");
    expect(recomputeLargestArmy(state)).toBe("p1");
  });

  it("transfers to a unique challenger who strictly exceeds the holder", () => {
    const state = stateWithKnights({ p1: 4, p2: 5 }, "p1");
    expect(recomputeLargestArmy(state)).toBe("p2");
  });

  it("never lapses — knightsPlayed only ever increases", () => {
    // Holder's own count can't decrease, so even a low count keeps the title
    // as long as it's still >= 3 and nobody else has caught up.
    const state = stateWithKnights({ p1: 3, p2: 1 }, "p1");
    expect(recomputeLargestArmy(state)).toBe("p1");
  });
});
