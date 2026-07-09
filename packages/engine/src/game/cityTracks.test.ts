import { describe, expect, it } from "vitest";
import {
  improveCityTrack,
  isSoleTrackLeader,
  nextTrackUpgradeCost,
  validateImproveCityTrack,
} from "./cityTracks.js";
import { testGameState } from "./testFixtures.js";

const CITY_VERTEX = "city-vertex";

function withCity(overrides: Parameters<typeof testGameState>[0] = {}) {
  return testGameState({
    buildings: new Map([[CITY_VERTEX, { playerId: "p1", type: "city" }]]),
    ...overrides,
  });
}

describe("validateImproveCityTrack / improveCityTrack", () => {
  it("rejects improving a track without owning any city", () => {
    const state = testGameState({
      players: testGameState().players.map((p) =>
        p.id === "p1" ? { ...p, commodities: { cloth: 5, coin: 5, paper: 5 } } : p,
      ),
    });
    expect(
      validateImproveCityTrack(state, {
        type: "IMPROVE_CITY_TRACK",
        playerId: "p1",
        track: "trade",
      }),
    ).toMatchObject({ code: "NO_CITY" });
  });

  it("rejects improving a track without enough commodities", () => {
    const state = withCity();
    expect(
      validateImproveCityTrack(state, {
        type: "IMPROVE_CITY_TRACK",
        playerId: "p1",
        track: "trade",
      }),
    ).toMatchObject({ code: "CANNOT_AFFORD" });
  });

  it("costs escalate 1, 2, 3, 4, 5 commodities per level and rejects going past level 5", () => {
    let state = withCity({
      players: withCity().players.map((p) =>
        p.id === "p1" ? { ...p, commodities: { cloth: 15, coin: 0, paper: 0 } } : p,
      ),
    });
    for (let level = 1; level <= 5; level++) {
      const player = state.players.find((p) => p.id === "p1")!;
      expect(nextTrackUpgradeCost(state, player, "trade")).toBe(level);
      const error = validateImproveCityTrack(state, {
        type: "IMPROVE_CITY_TRACK",
        playerId: "p1",
        track: "trade",
      });
      expect(error).toBeNull();
      const result = improveCityTrack(state, {
        type: "IMPROVE_CITY_TRACK",
        playerId: "p1",
        track: "trade",
      });
      state = result.state;
      expect(state.players.find((p) => p.id === "p1")!.cityImprovements.trade).toBe(level);
    }
    expect(
      validateImproveCityTrack(state, {
        type: "IMPROVE_CITY_TRACK",
        playerId: "p1",
        track: "trade",
      }),
    ).toMatchObject({ code: "TRACK_MAXED" });
  });

  it("an Apprentice credit discounts the next upgrade by 1, minimum 1, then is consumed", () => {
    const base = withCity();
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p1"
          ? { ...p, commodities: { cloth: 1, coin: 0, paper: 0 }, apprenticeCredit: true }
          : p,
      ),
    };
    const player = state.players.find((p) => p.id === "p1")!;
    expect(nextTrackUpgradeCost(state, player, "trade")).toBe(1); // level 0 -> 1 normally costs 1, floor stays 1
    const result = improveCityTrack(state, {
      type: "IMPROVE_CITY_TRACK",
      playerId: "p1",
      track: "trade",
    });
    const after = result.state.players.find((p) => p.id === "p1")!;
    expect(after.apprenticeCredit).toBe(false);
  });
});

describe("isSoleTrackLeader", () => {
  it("is true only when strictly ahead of every other player", () => {
    const base = testGameState();
    const tied = {
      ...base,
      players: base.players.map((p) => ({
        ...p,
        cityImprovements: { trade: 4, politics: 0, science: 0 },
      })),
    };
    expect(isSoleTrackLeader(tied, "p1", "trade", 4)).toBe(false);

    const ahead = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p1"
          ? { ...p, cityImprovements: { trade: 5, politics: 0, science: 0 } }
          : { ...p, cityImprovements: { trade: 4, politics: 0, science: 0 } },
      ),
    };
    expect(isSoleTrackLeader(ahead, "p1", "trade", 4)).toBe(true);
    expect(isSoleTrackLeader(ahead, "p1", "trade", 6)).toBe(false);
  });
});
