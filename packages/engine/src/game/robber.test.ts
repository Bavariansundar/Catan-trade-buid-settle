import { describe, expect, it } from "vitest";
import { vertexAt } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

const V0 = vertexAt(TEST_HEX.center, 0); // touches center, E, NE

describe("DISCARD", () => {
  it("discards the exact required count and returns cards to the bank", () => {
    const state = testGameState({
      phase: { name: "discard", pending: new Map([["p1", 4]]) },
      players: [
        {
          id: "p1",
          hand: { wood: 5, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "DISCARD",
      playerId: "p1",
      resources: { wood: 3, wheat: 1 },
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toEqual({ wood: 2, wheat: 3, sheep: 0, brick: 0, ore: 0 });
    expect(result.state.bank.wood).toBeGreaterThan(state.bank.wood);
    // Only pending player resolved -> straight to robber phase.
    expect(result.state.phase).toEqual({ name: "robber" });
  });

  it("stays in the discard phase while other players still owe a discard", () => {
    const state = testGameState({
      phase: {
        name: "discard",
        pending: new Map([
          ["p1", 4],
          ["p2", 1],
        ]),
      },
      players: [
        {
          id: "p1",
          hand: { wood: 5, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 2, wheat: 6, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, { type: "DISCARD", playerId: "p1", resources: { wood: 4 } });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toMatchObject({ name: "discard" });
    if (result.state.phase.name === "discard") {
      expect(result.state.phase.pending.has("p1")).toBe(false);
      expect(result.state.phase.pending.get("p2")).toBe(1);
    }
  });

  it("rejects a discard from a player who owes nothing", () => {
    const state = testGameState({ phase: { name: "discard", pending: new Map([["p1", 4]]) } });
    const result = applyAction(state, { type: "DISCARD", playerId: "p2", resources: {} });
    expect(result).toMatchObject({ code: "NOT_PENDING" });
  });

  it("rejects the wrong discard count", () => {
    const state = testGameState({
      phase: { name: "discard", pending: new Map([["p1", 4]]) },
      players: [
        {
          id: "p1",
          hand: { wood: 5, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, { type: "DISCARD", playerId: "p1", resources: { wood: 1 } });
    expect(result).toMatchObject({ code: "WRONG_DISCARD_COUNT" });
  });

  it("rejects discarding resources the player doesn't have", () => {
    const state = testGameState({
      phase: { name: "discard", pending: new Map([["p1", 4]]) },
      players: [
        {
          id: "p1",
          hand: { wood: 1, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, { type: "DISCARD", playerId: "p1", resources: { wood: 4 } });
    expect(result).toMatchObject({ code: "INSUFFICIENT_RESOURCES" });
  });
});

describe("MOVE_ROBBER", () => {
  it("moves the robber and steals from the only eligible adjacent player", () => {
    const state = testGameState({
      phase: { name: "robber" },
      currentPlayerIndex: 0,
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 2, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: TEST_HEX.center,
      stealFromPlayerId: "p2",
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.robber).toEqual(TEST_HEX.center);
    expect(result.state.phase).toEqual({ name: "main" });
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    const p2 = result.state.players.find((p) => p.id === "p2")!;
    expect(p1.hand.wood).toBe(1);
    expect(p2.hand.wood).toBe(1);
    expect(result.events.some((e) => e.type === "RESOURCE_STOLEN")).toBe(true);
    expect(result.state.rngState).not.toBe(state.rngState);
  });

  it("allows moving with no steal when nobody is adjacent", () => {
    const state = testGameState({ phase: { name: "robber" }, currentPlayerIndex: 0 });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: TEST_HEX.w,
      stealFromPlayerId: null,
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.robber).toEqual(TEST_HEX.w);
  });

  it("rejects leaving the robber on the same hex", () => {
    const state = testGameState({ phase: { name: "robber" }, currentPlayerIndex: 0 });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: state.robber,
      stealFromPlayerId: null,
    });
    expect(result).toMatchObject({ code: "ROBBER_MUST_MOVE" });
  });

  it("rejects moving the robber off the board", () => {
    const state = testGameState({ phase: { name: "robber" }, currentPlayerIndex: 0 });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: { q: 99, r: 99 },
      stealFromPlayerId: null,
    });
    expect(result).toMatchObject({ code: "OUT_OF_BOUNDS" });
  });

  it("rejects failing to steal when an eligible target exists", () => {
    const state = testGameState({
      phase: { name: "robber" },
      currentPlayerIndex: 0,
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 2, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: TEST_HEX.center,
      stealFromPlayerId: null,
    });
    expect(result).toMatchObject({ code: "MUST_STEAL" });
  });

  it("rejects stealing from a non-adjacent or empty-handed player", () => {
    const state = testGameState({
      phase: { name: "robber" },
      currentPlayerIndex: 0,
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        }, // 0 cards
      ],
    });
    const result = applyAction(state, {
      type: "MOVE_ROBBER",
      playerId: "p1",
      hex: TEST_HEX.center,
      stealFromPlayerId: "p2",
    });
    expect(result).toMatchObject({ code: "INVALID_STEAL_TARGET" });
  });
});
