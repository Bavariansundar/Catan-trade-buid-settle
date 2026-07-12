import { BASE_MODULE, createGame, redactEventsFor, viewFor } from "@baychearsbar/engine";
import {
  deserializeGameState,
  serializeGameEvents,
  serializeGameState,
  serializeGameView,
} from "./serialization.js";

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

describe("serializeGameView", () => {
  it("turns every Map field into a JSON-safe array of entries, matching apps/web's deserializeGameView", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "view-roundtrip" });
    const populated = {
      ...state,
      buildings: new Map([["v1", { playerId: "a", type: "settlement" as const }]]),
      roads: new Map([["e1", "a"]]),
    };
    const view = viewFor([BASE_MODULE], populated, "a");

    // Round-tripping through real JSON is what actually happens over the Socket.IO wire —
    // a Map survives an in-memory `{ ...view }` spread but not a JSON.stringify/parse hop.
    const wired = JSON.parse(JSON.stringify(serializeGameView(view))) as Record<string, unknown>;

    expect(Array.isArray(wired["buildings"])).toBe(true);
    expect(wired["buildings"]).toEqual([["v1", { playerId: "a", type: "settlement" }]]);
    expect(Array.isArray(wired["roads"])).toBe(true);
    expect(wired["roads"]).toEqual([["e1", "a"]]);
    expect(Array.isArray(wired["tradeOffers"])).toBe(true);
    expect(Array.isArray(wired["publicVictoryPoints"])).toBe(true);
  });

  it("turns the nested discard-phase pending Map into a JSON-safe array of entries", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "view-discard" });
    const discarding = {
      ...state,
      phase: { name: "discard" as const, pending: new Map([["a", 4]]) },
    };
    const view = viewFor([BASE_MODULE], discarding, "a");

    const wired = JSON.parse(JSON.stringify(serializeGameView(view))) as {
      phase: { name: string; pending: [string, number][] };
    };

    expect(wired.phase.name).toBe("discard");
    expect(wired.phase.pending).toEqual([["a", 4]]);
  });
});

describe("serializeGameEvents", () => {
  it("turns RESOURCES_PRODUCED.production into a JSON-safe array of entries", () => {
    const events = [
      {
        type: "RESOURCES_PRODUCED" as const,
        production: new Map([["a", { wood: 1 }], ["b", { ore: 2 }]] as const),
      },
    ];
    const wired = JSON.parse(JSON.stringify(serializeGameEvents(events))) as {
      type: string;
      production: [string, unknown][];
    }[];
    expect(wired[0]!.production).toEqual([
      ["a", { wood: 1 }],
      ["b", { ore: 2 }],
    ]);
  });

  it("turns MONOPOLY_PLAYED.seized into a JSON-safe array of entries", () => {
    const events = [
      {
        type: "MONOPOLY_PLAYED" as const,
        playerId: "a",
        resource: "ore" as const,
        seized: new Map([["b", 3]]),
      },
    ];
    const wired = JSON.parse(JSON.stringify(serializeGameEvents(events))) as {
      seized: [string, number][];
    }[];
    expect(wired[0]!.seized).toEqual([["b", 3]]);
  });

  it("passes every other event through unchanged", () => {
    const events = [{ type: "TURN_STARTED" as const, playerId: "a" }];
    expect(serializeGameEvents(events)).toEqual(events);
  });

  it("composes with redactEventsFor — a redacted DISCARDED event has no resources field to serialize", () => {
    const events = [{ type: "DISCARDED" as const, playerId: "a", resources: { wood: 4 } }];
    const redacted = redactEventsFor(events, "b");
    const wired = JSON.parse(JSON.stringify(serializeGameEvents(redacted))) as Record<
      string,
      unknown
    >[];
    expect(wired[0]).toEqual({ type: "DISCARDED", playerId: "a" });
  });
});
