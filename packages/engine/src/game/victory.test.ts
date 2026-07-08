import { describe, expect, it } from "vitest";
import { edgesOfVertex, vertexAt } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { computePublicVictoryPoints, computeVictoryPoints, hasWon } from "./victory.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

const V0 = vertexAt(TEST_HEX.center, 0);
const V1 = vertexAt(TEST_HEX.center, 2);

describe("computeVictoryPoints", () => {
  it("counts 1 per settlement and 2 per city", () => {
    const state = testGameState({
      buildings: new Map([
        [V0.id, { playerId: "p1", type: "settlement" as const }],
        [V1.id, { playerId: "p1", type: "city" as const }],
      ]),
    });
    expect(computeVictoryPoints(state, "p1")).toBe(3);
  });

  it("adds 2 for Longest Road and 2 for Largest Army when held", () => {
    const state = testGameState({ longestRoadPlayerId: "p1", largestArmyPlayerId: "p1" });
    expect(computeVictoryPoints(state, "p1")).toBe(4);
  });

  it("adds 1 per hidden VP dev card, but computePublicVictoryPoints excludes them", () => {
    const state = testGameState({
      players: [
        {
          id: "p1",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [
            { type: "victory_point", boughtTurn: 0 },
            { type: "victory_point", boughtTurn: 0 },
          ],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        testGameState().players[1]!,
      ],
    });
    expect(computeVictoryPoints(state, "p1")).toBe(2);
    expect(computePublicVictoryPoints(state, "p1")).toBe(0);
  });
});

describe("hasWon", () => {
  it("is true once total VP (including hidden cards) reaches the target", () => {
    const state = testGameState({
      targetVictoryPoints: 2,
      buildings: new Map([[V0.id, { playerId: "p1", type: "city" as const }]]),
    });
    expect(hasWon(state, "p1")).toBe(true);
  });

  it("is false below the target", () => {
    const state = testGameState({
      targetVictoryPoints: 10,
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(hasWon(state, "p1")).toBe(false);
  });
});

describe("victory via applyAction — win only on your own turn", () => {
  it("ends the game immediately when a settlement crosses the target for the builder", () => {
    const connectingEdge = edgesOfVertex(V0)[0];
    const state = testGameState({
      targetVictoryPoints: 3,
      phase: { name: "main" },
      buildings: new Map([[V1.id, { playerId: "p1", type: "city" as const }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 1, sheep: 1, ore: 0 },
          pieces: { settlements: 4, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        testGameState().players[1]!,
      ],
      roads: new Map([[connectingEdge.id, "p1"]]),
    });
    const result = applyAction(state, { type: "BUILD_SETTLEMENT", playerId: "p1", vertex: V0 });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toMatchObject({ name: "ended", winner: "p1" });
    expect(result.events.some((e) => e.type === "GAME_ENDED")).toBe(true);
  });

  it("buying a VP dev card can itself trigger victory (no need to play it)", () => {
    const state = testGameState({
      targetVictoryPoints: 2,
      devDeck: ["victory_point"],
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" as const }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 1, wheat: 1, sheep: 1, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        testGameState().players[1]!,
      ],
    });
    const result = applyAction(state, { type: "BUY_DEV_CARD", playerId: "p1" });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toMatchObject({ name: "ended", winner: "p1" });
  });

  it("does not end the game for a third party who already qualifies but isn't acting", () => {
    // p2 already has enough hidden VP to meet the target from the very
    // start. p1 (the current player) takes a wholly unrelated, guaranteed-
    // legal action; victory is only ever checked for the acting player, so
    // the game must not end just because p2 happens to already qualify.
    const [firstEdge, secondEdge] = edgesOfVertex(V0);
    const state = testGameState({
      targetVictoryPoints: 3,
      currentPlayerIndex: 0,
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" as const }]]),
      roads: new Map([[firstEdge.id, "p1"]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 4, cities: 4, roads: 14 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [
            { type: "victory_point", boughtTurn: 0 },
            { type: "victory_point", boughtTurn: 0 },
            { type: "victory_point", boughtTurn: 0 },
          ],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    expect(hasWon(state, "p2")).toBe(true);

    const result = applyAction(state, { type: "BUILD_ROAD", playerId: "p1", edge: secondEdge });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.phase).toEqual({ name: "main" });
  });
});
