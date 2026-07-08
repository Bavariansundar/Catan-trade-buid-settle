import { describe, expect, it } from "vitest";
import { vertexAt } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { computeProduction, pendingDiscards, validateRollDice } from "./dice.js";
import { findRngStateForDiceTotal, testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

describe("validateRollDice", () => {
  it("rejects rolling outside the roll phase", () => {
    const state = testGameState({ phase: { name: "main" } });
    expect(validateRollDice(state, "p1")).toMatchObject({ code: "WRONG_PHASE" });
  });

  it("rejects rolling out of turn", () => {
    const state = testGameState({ phase: { name: "roll" }, currentPlayerIndex: 0 });
    expect(validateRollDice(state, "p2")).toMatchObject({ code: "NOT_YOUR_TURN" });
  });

  it("accepts a roll from the current player during the roll phase", () => {
    const state = testGameState({ phase: { name: "roll" }, currentPlayerIndex: 0 });
    expect(validateRollDice(state, "p1")).toBeNull();
  });
});

describe("computeProduction", () => {
  it("gives a settlement 1 resource matching the rolled hex", () => {
    const vertex = vertexAt(TEST_HEX.center, 0); // touches center(ore/5), E(wood/8), NE(wheat/6)
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    });
    const production = computeProduction(state, 5);
    expect(production.get("p1")).toEqual({ ore: 1 });
  });

  it("gives a city 2 resources", () => {
    const vertex = vertexAt(TEST_HEX.center, 0);
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]),
    });
    const production = computeProduction(state, 5);
    expect(production.get("p1")).toEqual({ ore: 2 });
  });

  it("produces nothing for a hex the robber occupies", () => {
    const vertex = vertexAt(TEST_HEX.center, 0);
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
      robber: TEST_HEX.center,
    });
    const production = computeProduction(state, 5);
    expect(production.get("p1")).toBeUndefined();
  });

  it("produces nothing for a roll matching no hex", () => {
    const vertex = vertexAt(TEST_HEX.center, 0);
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    });
    expect(computeProduction(state, 2).size).toBe(0);
  });

  it("bank shortage: a single entitled player still gets what's left in the bank", () => {
    const vertex = vertexAt(TEST_HEX.center, 0); // ore/5
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]), // demands 2 ore
      bank: { wood: 19, wheat: 19, sheep: 19, brick: 19, ore: 1 },
    });
    const production = computeProduction(state, 5);
    expect(production.get("p1")).toEqual({ ore: 1 });
  });

  it("bank shortage: nobody gets the resource when multiple players are entitled", () => {
    const vertexP1 = vertexAt(TEST_HEX.center, 0); // touches center
    const vertexP2 = vertexAt(TEST_HEX.center, 1); // touches center, NE, NW
    const state = testGameState({
      buildings: new Map([
        [vertexP1.id, { playerId: "p1", type: "settlement" }],
        [vertexP2.id, { playerId: "p2", type: "settlement" }],
      ]),
      bank: { wood: 19, wheat: 19, sheep: 19, brick: 19, ore: 1 },
    });
    const production = computeProduction(state, 5);
    expect(production.size).toBe(0);
  });
});

describe("pendingDiscards", () => {
  it("owes floor(total/2) to players with more than 7 cards", () => {
    const state = testGameState({
      players: [
        {
          id: "p1",
          hand: { wood: 5, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
        }, // 9 cards
        {
          id: "p2",
          hand: { wood: 3, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
        }, // 3 cards
      ],
    });
    const pending = pendingDiscards(state);
    expect(pending.get("p1")).toBe(4);
    expect(pending.has("p2")).toBe(false);
  });
});

describe("ROLL_DICE via applyAction", () => {
  it("rolling a non-7 total produces resources and transitions to main", () => {
    const vertex = vertexAt(TEST_HEX.center, 0);
    const seed = findRngStateForDiceTotal(5);
    const state = testGameState({
      phase: { name: "roll" },
      currentPlayerIndex: 0,
      rngState: seed,
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    });
    const result = applyAction(state, { type: "ROLL_DICE", playerId: "p1" });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.diceRoll).not.toBeNull();
    expect(result.state.diceRoll![0] + result.state.diceRoll![1]).toBe(5);
    expect(result.state.phase).toEqual({ name: "main" });
    expect(result.state.players.find((p) => p.id === "p1")!.hand.ore).toBe(1);
    expect(result.events.some((e) => e.type === "RESOURCES_PRODUCED")).toBe(true);
  });

  it("rolling a 7 with everyone at or under 7 cards goes straight to the robber phase", () => {
    const seed = findRngStateForDiceTotal(7);
    const state = testGameState({ phase: { name: "roll" }, currentPlayerIndex: 0, rngState: seed });
    const result = applyAction(state, { type: "ROLL_DICE", playerId: "p1" });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toEqual({ name: "robber" });
  });

  it("rolling a 7 with someone over 7 cards goes to the discard phase", () => {
    const seed = findRngStateForDiceTotal(7);
    const state = testGameState({
      phase: { name: "roll" },
      currentPlayerIndex: 0,
      rngState: seed,
      players: [
        {
          id: "p1",
          hand: { wood: 5, wheat: 4, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
        },
        {
          id: "p2",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
        },
      ],
    });
    const result = applyAction(state, { type: "ROLL_DICE", playerId: "p1" });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toMatchObject({ name: "discard" });
    if (result.state.phase.name === "discard") {
      expect(result.state.phase.pending.get("p1")).toBe(4);
    }
    expect(result.events.some((e) => e.type === "MUST_DISCARD")).toBe(true);
  });
});
