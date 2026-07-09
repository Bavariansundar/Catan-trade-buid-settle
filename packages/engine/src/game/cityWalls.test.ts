import { describe, expect, it } from "vitest";
import { verticesOfHex } from "../coordinates.js";
import {
  buildCityWall,
  discardThreshold,
  pendingDiscardsWithWalls,
  validateBuildCityWall,
} from "./cityWalls.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_P1_CITY = verticesOfHex(TEST_HEX.center)[0]!;

function withCity(overrides: Parameters<typeof testGameState>[0] = {}) {
  return testGameState({
    buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "city" }]]),
    players: testGameState().players.map((p) =>
      p.id === "p1"
        ? {
            ...p,
            hand: { wood: 0, wheat: 0, sheep: 0, brick: 2, ore: 0 },
            pieces: { ...p.pieces, cityWalls: 5 },
          }
        : p,
    ),
    ...overrides,
  });
}

describe("validateBuildCityWall / buildCityWall", () => {
  it("builds a wall on the player's own city for 2 brick", () => {
    const state = withCity();
    const action = { type: "BUILD_CITY_WALL" as const, playerId: "p1", vertex: V_P1_CITY };
    expect(validateBuildCityWall(state, action)).toBeNull();
    const result = buildCityWall(state, action);
    expect(result.state.cityWalls.has(V_P1_CITY.id)).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.brick).toBe(0);
  });

  it("rejects walling a vertex that isn't the player's own city", () => {
    const state = testGameState({
      buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "settlement" }]]),
    });
    const action = { type: "BUILD_CITY_WALL" as const, playerId: "p1", vertex: V_P1_CITY };
    expect(validateBuildCityWall(state, action)).toMatchObject({ code: "NOT_YOUR_CITY" });
  });

  it("rejects walling the same city twice", () => {
    const state = withCity({ cityWalls: new Set([V_P1_CITY.id]) });
    const action = { type: "BUILD_CITY_WALL" as const, playerId: "p1", vertex: V_P1_CITY };
    expect(validateBuildCityWall(state, action)).toMatchObject({ code: "ALREADY_WALLED" });
  });
});

describe("discardThreshold / pendingDiscardsWithWalls", () => {
  it("is 7 with no walls, +2 per wall the player has built", () => {
    const noWalls = withCity();
    expect(discardThreshold(noWalls, "p1")).toBe(7);
    const oneWall = withCity({ cityWalls: new Set([V_P1_CITY.id]) });
    expect(discardThreshold(oneWall, "p1")).toBe(9);
  });

  it("raises the threshold at which a player owes a discard", () => {
    const bigHand = { wood: 2, wheat: 2, sheep: 2, brick: 2, ore: 1 }; // total 9
    const withoutWall = testGameState({
      players: testGameState().players.map((p) => (p.id === "p1" ? { ...p, hand: bigHand } : p)),
    });
    expect(pendingDiscardsWithWalls(withoutWall).get("p1")).toBe(4);

    const withWall = testGameState({
      buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "city" }]]),
      cityWalls: new Set([V_P1_CITY.id]),
      players: testGameState().players.map((p) => (p.id === "p1" ? { ...p, hand: bigHand } : p)),
    });
    expect(pendingDiscardsWithWalls(withWall).has("p1")).toBe(false); // 9 <= 9, no discard owed
  });
});
