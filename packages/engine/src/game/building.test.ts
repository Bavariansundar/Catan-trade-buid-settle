import { describe, expect, it } from "vitest";
import { BASE_MODULE } from "./modules/base.js";
import { edgeAt, edgesOfHex, edgesOfVertex, vertexAt, verticesOfEdge } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

const V0 = vertexAt(TEST_HEX.center, 0); // touches center, E, NE

function otherEndpoint(edge: ReturnType<typeof edgeAt>, known: ReturnType<typeof vertexAt>) {
  const [a, b] = verticesOfEdge(edge);
  return a.id === known.id ? b : a;
}

describe("BUILD_ROAD", () => {
  it("builds a road connected to the player's own settlement", () => {
    const edge = edgesOfVertex(V0)[0];
    const state = testGameState({
      phase: { name: "main" },
      currentPlayerIndex: 0,
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 4, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, { type: "BUILD_ROAD", playerId: "p1", edge });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.roads.get(edge.id)).toBe("p1");
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toEqual({ wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 });
    expect(p1.pieces.roads).toBe(14);
  });

  it("rejects a road on an already-occupied edge", () => {
    const edge = edgesOfVertex(V0)[0];
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      roads: new Map([[edge.id, "p2"]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, { type: "BUILD_ROAD", playerId: "p1", edge });
    expect(result).toMatchObject({ code: "EDGE_OCCUPIED" });
  });

  it("rejects a road not connected to the player's network", () => {
    // On the board but nowhere near V0's settlement — no connectivity.
    const disconnectedEdge = edgesOfHex(TEST_HEX.w)[0]!;
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_ROAD",
      playerId: "p1",
      edge: disconnectedEdge,
    });
    expect(result).toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("rejects a road off the board", () => {
    const edge = edgeAt({ q: 50, r: 0 }, 0);
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
    });
    // give connectivity via the settlement but the edge itself is off-board
    const result = applyAction([BASE_MODULE], state, { type: "BUILD_ROAD", playerId: "p1", edge });
    expect(result).toMatchObject({ code: "OUT_OF_BOUNDS" });
  });

  it("rejects a road the player cannot afford", () => {
    const edge = edgesOfVertex(V0)[0];
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, { type: "BUILD_ROAD", playerId: "p1", edge });
    expect(result).toMatchObject({ code: "CANNOT_AFFORD" });
  });

  it("rejects a road when the player has none left in supply", () => {
    const edge = edgesOfVertex(V0)[0];
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 0, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, { type: "BUILD_ROAD", playerId: "p1", edge });
    expect(result).toMatchObject({ code: "NO_PIECES_LEFT" });
  });

  it("rejects building outside the main phase / out of turn", () => {
    const edge = edgesOfVertex(V0)[0];
    const state = testGameState({ phase: { name: "roll" } });
    const wrongPhase = applyAction([BASE_MODULE], state, {
      type: "BUILD_ROAD",
      playerId: "p1",
      edge,
    });
    expect(wrongPhase).toMatchObject({ code: "WRONG_PHASE" });

    const wrongTurn = applyAction([BASE_MODULE], testGameState({ currentPlayerIndex: 1 }), {
      type: "BUILD_ROAD",
      playerId: "p1",
      edge,
    });
    expect(wrongTurn).toMatchObject({ code: "NOT_YOUR_TURN" });
  });
});

describe("BUILD_SETTLEMENT", () => {
  function twoRoadNetwork() {
    const edge0 = edgesOfVertex(V0)[0];
    const v1 = otherEndpoint(edge0, V0);
    const edge1 = edgesOfVertex(v1).find((e) => e.id !== edge0.id)!;
    const v2 = otherEndpoint(edge1, v1);
    return { edge0, v1, edge1, v2 };
  }

  it("builds a settlement 2 roads out from the starting settlement", () => {
    const { edge0, edge1, v2 } = twoRoadNetwork();
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      roads: new Map([
        [edge0.id, "p1"],
        [edge1.id, "p1"],
      ]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 1, sheep: 1, ore: 0 },
          pieces: { settlements: 4, cities: 4, roads: 13, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_SETTLEMENT",
      playerId: "p1",
      vertex: v2,
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.buildings.get(v2.id)).toEqual({ playerId: "p1", type: "settlement" });
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.pieces.settlements).toBe(3);
  });

  it("rejects a settlement violating the distance rule", () => {
    const edge0 = edgesOfVertex(V0)[0];
    const v1 = otherEndpoint(edge0, V0);
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      roads: new Map([[edge0.id, "p1"]]),
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 1, sheep: 1, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_SETTLEMENT",
      playerId: "p1",
      vertex: v1,
    });
    expect(result).toMatchObject({ code: "DISTANCE_RULE" });
  });

  it("rejects a settlement not connected to the player's own road", () => {
    const { v2 } = twoRoadNetwork();
    const state = testGameState({
      phase: { name: "main" },
      players: [
        {
          id: "p1",
          hand: { wood: 1, brick: 1, wheat: 1, sheep: 1, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_SETTLEMENT",
      playerId: "p1",
      vertex: v2,
    });
    expect(result).toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("rejects a settlement on an occupied vertex", () => {
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" }]]),
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_SETTLEMENT",
      playerId: "p1",
      vertex: V0,
    });
    expect(result).toMatchObject({ code: "VERTEX_OCCUPIED" });
  });
});

describe("BUILD_CITY", () => {
  it("upgrades the player's own settlement to a city and returns the settlement piece", () => {
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 3, wheat: 2, wood: 0, sheep: 0, brick: 0 },
          pieces: { settlements: 4, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_CITY",
      playerId: "p1",
      vertex: V0,
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.buildings.get(V0.id)).toEqual({ playerId: "p1", type: "city" });
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.pieces).toEqual({
      settlements: 5,
      cities: 3,
      roads: 15,
      ships: 0,
      knights: 0,
      cityWalls: 0,
    });
    expect(p1.hand).toEqual({ ore: 0, wheat: 0, wood: 0, sheep: 0, brick: 0 });
  });

  it("rejects upgrading a vertex with no settlement", () => {
    const state = testGameState({ phase: { name: "main" } });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_CITY",
      playerId: "p1",
      vertex: V0,
    });
    expect(result).toMatchObject({ code: "NO_SETTLEMENT_TO_UPGRADE" });
  });

  it("rejects upgrading another player's settlement", () => {
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 3, wheat: 2, wood: 0, sheep: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_CITY",
      playerId: "p1",
      vertex: V0,
    });
    expect(result).toMatchObject({ code: "NO_SETTLEMENT_TO_UPGRADE" });
  });

  it("rejects upgrading a vertex that's already a city", () => {
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "city" }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 3, wheat: 2, wood: 0, sheep: 0, brick: 0 },
          pieces: { settlements: 5, cities: 3, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_CITY",
      playerId: "p1",
      vertex: V0,
    });
    expect(result).toMatchObject({ code: "NO_SETTLEMENT_TO_UPGRADE" });
  });

  it("rejects a city the player cannot afford", () => {
    const state = testGameState({
      phase: { name: "main" },
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 1, wheat: 0, wood: 0, sheep: 0, brick: 0 },
          pieces: { settlements: 4, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        {
          id: "p2",
          hand: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
      ],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "BUILD_CITY",
      playerId: "p1",
      vertex: V0,
    });
    expect(result).toMatchObject({ code: "CANNOT_AFFORD" });
  });
});
