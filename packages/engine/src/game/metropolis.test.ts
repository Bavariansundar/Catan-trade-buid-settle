import { describe, expect, it } from "vitest";
import { verticesOfHex } from "../coordinates.js";
import { buildMetropolis, validateBuildMetropolis } from "./metropolis.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_P1_CITY = verticesOfHex(TEST_HEX.center)[0]!;
const V_P2_CITY = verticesOfHex(TEST_HEX.w)[0]!;

function leaderState(overrides: Parameters<typeof testGameState>[0] = {}) {
  return testGameState({
    buildings: new Map([
      [V_P1_CITY.id, { playerId: "p1", type: "city" }],
      [V_P2_CITY.id, { playerId: "p2", type: "city" }],
    ]),
    players: testGameState().players.map((p) =>
      p.id === "p1" ? { ...p, cityImprovements: { trade: 4, politics: 0, science: 0 } } : p,
    ),
    ...overrides,
  });
}

describe("validateBuildMetropolis / buildMetropolis", () => {
  it("builds a metropolis for the sole track leader (level >= 4)", () => {
    const state = leaderState();
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p1",
      vertex: V_P1_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(state, action)).toBeNull();
    const result = buildMetropolis(state, action);
    expect(result.state.metropolises.get("trade")).toEqual({
      playerId: "p1",
      vertex: V_P1_CITY.id,
    });
    expect(result.events).toEqual([
      { type: "METROPOLIS_BUILT", playerId: "p1", vertex: V_P1_CITY, track: "trade" },
    ]);
  });

  it("rejects a tie for track leadership", () => {
    const tied = leaderState({
      players: leaderState().players.map((p) => ({
        ...p,
        cityImprovements: { trade: 4, politics: 0, science: 0 },
      })),
    });
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p1",
      vertex: V_P1_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(tied, action)).toMatchObject({ code: "NOT_SOLE_LEADER" });
  });

  it("rejects a track level below 4", () => {
    const state = leaderState({
      players: leaderState().players.map((p) =>
        p.id === "p1" ? { ...p, cityImprovements: { trade: 3, politics: 0, science: 0 } } : p,
      ),
    });
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p1",
      vertex: V_P1_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(state, action)).toMatchObject({ code: "NOT_SOLE_LEADER" });
  });

  it("transfers the metropolis to a new strict sole leader, reverting the old holder's city", () => {
    const state = leaderState({
      metropolises: new Map([["trade", { playerId: "p1", vertex: V_P1_CITY.id }]]),
      players: leaderState().players.map((p) =>
        p.id === "p2" ? { ...p, cityImprovements: { trade: 5, politics: 0, science: 0 } } : p,
      ),
    });
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p2",
      vertex: V_P2_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(state, action)).toBeNull();
    const result = buildMetropolis(state, action);
    expect(result.state.metropolises.get("trade")).toEqual({
      playerId: "p2",
      vertex: V_P2_CITY.id,
    });
    expect(result.events).toEqual([
      {
        type: "METROPOLIS_TRANSFERRED",
        fromPlayerId: "p1",
        toPlayerId: "p2",
        track: "trade",
        vertex: V_P2_CITY,
      },
    ]);
  });

  it("rejects reclaiming a metropolis the player already holds", () => {
    const state = leaderState({
      metropolises: new Map([["trade", { playerId: "p1", vertex: V_P1_CITY.id }]]),
    });
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p1",
      vertex: V_P1_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(state, action)).toMatchObject({ code: "ALREADY_HOLDER" });
  });

  it("rejects building on a vertex that isn't the player's own city", () => {
    const state = leaderState();
    const action = {
      type: "BUILD_METROPOLIS" as const,
      playerId: "p1",
      vertex: V_P2_CITY,
      track: "trade" as const,
    };
    expect(validateBuildMetropolis(state, action)).toMatchObject({ code: "NOT_YOUR_CITY" });
  });
});
