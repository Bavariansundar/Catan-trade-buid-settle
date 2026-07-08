import { describe, expect, it } from "vitest";
import { edgesOfVertex, vertexAt } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

const V0 = vertexAt(TEST_HEX.center, 0); // touches center(ore/5), E(wood/8), NE(wheat/6)

describe("BUY_DEV_CARD", () => {
  it("draws the top card, deducts cost, and tags it with the current turn", () => {
    const state = testGameState({
      turnNumber: 3,
      devDeck: ["monopoly", "knight", "knight"],
      players: [
        {
          id: "p1",
          hand: { ore: 1, wheat: 1, sheep: 1, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, { type: "BUY_DEV_CARD", playerId: "p1" });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.devCards).toEqual([{ type: "monopoly", boughtTurn: 3 }]);
    expect(p1.hand).toEqual({ ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 });
    expect(result.state.devDeck).toEqual(["knight", "knight"]);
  });

  it("rejects buying when the deck is empty", () => {
    const state = testGameState({ devDeck: [] });
    const result = applyAction(state, { type: "BUY_DEV_CARD", playerId: "p1" });
    expect(result).toMatchObject({ code: "DECK_EMPTY" });
  });

  it("rejects buying without enough resources", () => {
    const state = testGameState({ devDeck: ["knight"] });
    const result = applyAction(state, { type: "BUY_DEV_CARD", playerId: "p1" });
    expect(result).toMatchObject({ code: "CANNOT_AFFORD" });
  });
});

describe("PLAY_DEV_CARD — general gating", () => {
  function playerWithCard(cardBoughtTurn: number) {
    return {
      id: "p1",
      hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
      pieces: { settlements: 5, cities: 4, roads: 15 },
      devCards: [{ type: "knight" as const, boughtTurn: cardBoughtTurn }],
      knightsPlayed: 0,
      devCardPlayedThisTurn: false,
    };
  }

  it("rejects playing a card bought this turn", () => {
    const state = testGameState({
      turnNumber: 5,
      players: [playerWithCard(5), testGameState().players[1]!],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "knight",
      playerId: "p1",
      hex: TEST_HEX.w,
      stealFromPlayerId: null,
    });
    expect(result).toMatchObject({ code: "CARD_NOT_PLAYABLE" });
  });

  it("rejects a second dev card play in the same turn", () => {
    const player = { ...playerWithCard(0), devCardPlayedThisTurn: true };
    const state = testGameState({ turnNumber: 5, players: [player, testGameState().players[1]!] });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "knight",
      playerId: "p1",
      hex: TEST_HEX.w,
      stealFromPlayerId: null,
    });
    expect(result).toMatchObject({ code: "ALREADY_PLAYED" });
  });

  it("rejects playing a card type the player doesn't have", () => {
    const state = testGameState({
      turnNumber: 5,
      players: [playerWithCard(0), testGameState().players[1]!],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "monopoly",
      playerId: "p1",
      resource: "wood",
    });
    expect(result).toMatchObject({ code: "CARD_NOT_PLAYABLE" });
  });
});

describe("PLAY_DEV_CARD — knight", () => {
  it("moves the robber, may steal, increments knightsPlayed, and marks the card used", () => {
    const state = testGameState({
      turnNumber: 5,
      buildings: new Map([[V0.id, { playerId: "p2", type: "settlement" as const }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [{ type: "knight", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 2, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "knight",
      playerId: "p1",
      hex: TEST_HEX.center,
      stealFromPlayerId: "p2",
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.robber).toEqual(TEST_HEX.center);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.knightsPlayed).toBe(1);
    expect(p1.devCards).toEqual([]);
    expect(p1.devCardPlayedThisTurn).toBe(true);
    expect(p1.hand.ore).toBe(1);
    expect(result.events.some((e) => e.type === "KNIGHT_PLAYED")).toBe(true);
    expect(result.events.some((e) => e.type === "RESOURCE_STOLEN")).toBe(true);
    // Still in the main phase throughout — knight play doesn't change phase.
    expect(result.state.phase).toEqual({ name: "main" });
  });
});

describe("PLAY_DEV_CARD — monopoly", () => {
  it("seizes every other player's cards of the chosen resource", () => {
    const state = testGameState({
      turnNumber: 5,
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [{ type: "monopoly", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 3, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "monopoly",
      playerId: "p1",
      resource: "wheat",
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    const p2 = result.state.players.find((p) => p.id === "p2")!;
    expect(p1.hand.wheat).toBe(3);
    expect(p2.hand.wheat).toBe(0);
    const event = result.events.find((e) => e.type === "MONOPOLY_PLAYED");
    expect(event).toMatchObject({ resource: "wheat" });
  });
});

describe("PLAY_DEV_CARD — road building", () => {
  it("builds up to 2 free roads with no resource cost", () => {
    const edges = edgesOfVertex(V0);
    const state = testGameState({
      turnNumber: 5,
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" as const }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [{ type: "road_building", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "road_building",
      playerId: "p1",
      edges: [edges[0], edges[1]],
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    expect(result.state.roads.get(edges[0].id)).toBe("p1");
    expect(result.state.roads.get(edges[1].id)).toBe("p1");
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.pieces.roads).toBe(13);
    expect(p1.hand).toEqual({ ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 });
  });

  it("rejects more roads than remain in the player's supply", () => {
    const edges = edgesOfVertex(V0);
    const state = testGameState({
      turnNumber: 5,
      buildings: new Map([[V0.id, { playerId: "p1", type: "settlement" as const }]]),
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 1 },
          devCards: [{ type: "road_building", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "road_building",
      playerId: "p1",
      edges: [edges[0], edges[1]],
    });
    expect(result).toMatchObject({ code: "NO_PIECES_LEFT" });
  });
});

describe("PLAY_DEV_CARD — year of plenty", () => {
  it("grants 2 free resources from the bank", () => {
    const state = testGameState({
      turnNumber: 5,
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [{ type: "year_of_plenty", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "year_of_plenty",
      playerId: "p1",
      resources: ["ore", "ore"],
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.ore).toBe(2);
    expect(result.state.bank.ore).toBe(state.bank.ore - 2);
  });

  it("rejects when the bank doesn't have enough of a requested resource", () => {
    const state = testGameState({
      turnNumber: 5,
      bank: { ore: 1, wheat: 19, sheep: 19, wood: 19, brick: 19 },
      players: [
        {
          id: "p1",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [{ type: "year_of_plenty", boughtTurn: 0 }],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
        {
          id: "p2",
          hand: { ore: 0, wheat: 0, sheep: 0, wood: 0, brick: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15 },
          devCards: [],
          knightsPlayed: 0,
          devCardPlayedThisTurn: false,
        },
      ],
    });
    const result = applyAction(state, {
      type: "PLAY_DEV_CARD",
      card: "year_of_plenty",
      playerId: "p1",
      resources: ["ore", "ore"],
    });
    expect(result).toMatchObject({ code: "BANK_EMPTY" });
  });
});
