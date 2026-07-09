import { BASE_MODULE, createGame } from "@hexhaven/engine";
import { deserializeGameState, serializeGameState } from "./serialization.js";

describe("serializeGameState / deserializeGameState", () => {
  it("round-trips a freshly created game state exactly", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "roundtrip-1" });
    const roundTripped = deserializeGameState(
      JSON.parse(JSON.stringify(serializeGameState(state))),
    );
    expect(roundTripped).toEqual(state);
  });

  it("round-trips Map/Set fields populated with real data (buildings, roads, city walls)", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "roundtrip-2" });
    const populated = {
      ...state,
      buildings: new Map([["v1", { playerId: "a", type: "settlement" as const }]]),
      roads: new Map([["e1", "a"]]),
      cityWalls: new Set(["v1", "v2"]),
    };
    const roundTripped = deserializeGameState(
      JSON.parse(JSON.stringify(serializeGameState(populated))),
    );
    expect(roundTripped.buildings).toEqual(populated.buildings);
    expect(roundTripped.roads).toEqual(populated.roads);
    expect(roundTripped.cityWalls).toEqual(populated.cityWalls);
  });

  it("round-trips a discard phase's pending Map", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "roundtrip-3" });
    const discarding = {
      ...state,
      phase: { name: "discard" as const, pending: new Map([["a", 4]]) },
    };
    const roundTripped = deserializeGameState(
      JSON.parse(JSON.stringify(serializeGameState(discarding))),
    );
    expect(roundTripped.phase).toEqual(discarding.phase);
  });
});
