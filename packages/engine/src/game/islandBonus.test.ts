import { describe, expect, it } from "vitest";
import { hexesWithinRadius, vertexAt } from "../coordinates.js";
import { checkIslandBonus } from "./islandBonus.js";
import { testGameState } from "./testFixtures.js";
import type { HexTile } from "../types.js";

const HOME_ISLAND = hexesWithinRadius({ q: 0, r: 0 }, 1); // 7 hexes
const OTHER_ISLAND = hexesWithinRadius({ q: 5, r: -2 }, 1); // 7 hexes, far away

function tilesFor(hexes: readonly { q: number; r: number }[]): HexTile[] {
  return hexes.map((hex) => ({ hex, terrain: "wood", number: 6 }));
}

function stateWith() {
  return testGameState({
    board: { tiles: tilesFor([...HOME_ISLAND, ...OTHER_ISLAND]), harbors: [] },
    homeIslandHexes: HOME_ISLAND,
  });
}

describe("checkIslandBonus", () => {
  it("awards the bonus for the first settlement on a non-home island", () => {
    const state = stateWith();
    const vertex = vertexAt(OTHER_ISLAND[0]!, 0);
    const result = checkIslandBonus(state, "p1", vertex);
    expect(result.state.islandBonusAwarded.size).toBe(1);
    expect([...result.state.islandBonusAwarded.values()]).toEqual(["p1"]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: "ISLAND_BONUS_AWARDED", playerId: "p1" });
  });

  it("does not award anything for a settlement on the home island", () => {
    const state = stateWith();
    const vertex = vertexAt(HOME_ISLAND[0]!, 0);
    const result = checkIslandBonus(state, "p1", vertex);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("does not award the bonus twice for the same island", () => {
    const state = stateWith();
    const vertex1 = vertexAt(OTHER_ISLAND[0]!, 0);
    const first = checkIslandBonus(state, "p1", vertex1);

    const vertex2 = vertexAt(OTHER_ISLAND[1]!, 3);
    const second = checkIslandBonus(first.state, "p2", vertex2);
    expect(second.events).toEqual([]);
    expect(second.state.islandBonusAwarded.size).toBe(1);
    expect([...second.state.islandBonusAwarded.values()]).toEqual(["p1"]);
  });

  it("is a no-op for a vertex touching no land hex", () => {
    const state = stateWith();
    const vertex = vertexAt({ q: 100, r: 100 }, 0);
    const result = checkIslandBonus(state, "p1", vertex);
    expect(result.events).toEqual([]);
  });
});
