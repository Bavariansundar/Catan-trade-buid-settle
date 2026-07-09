import { describe, expect, it } from "vitest";
import { BASE_MODULE } from "./modules/base.js";
import { verticesOfEdge } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { bestMaritimeRatio } from "./trading.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import { isRuleError } from "./types.js";

function playerWithHand(id: string, hand: Partial<Record<string, number>>) {
  return {
    id,
    hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0, ...hand },
    pieces: { settlements: 5, cities: 4, roads: 15, ships: 0 },
    devCards: [],
    knightsPlayed: 0,
    devCardPlayedThisTurn: false,
    shipMovedThisTurn: false,
  };
}

describe("PROPOSE_TRADE / ACCEPT_TRADE", () => {
  it("proposes then accepts a trade, swapping resources between the two players", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    expect(isRuleError(proposed)).toBe(false);
    if (isRuleError(proposed)) return;
    const tradeId = [...proposed.state.tradeOffers.keys()][0]!;

    const accepted = applyAction([BASE_MODULE], proposed.state, {
      type: "ACCEPT_TRADE",
      playerId: "p2",
      tradeId,
    });
    expect(isRuleError(accepted)).toBe(false);
    if (isRuleError(accepted)) return;
    const p1 = accepted.state.players.find((p) => p.id === "p1")!;
    const p2 = accepted.state.players.find((p) => p.id === "p2")!;
    expect(p1.hand).toMatchObject({ wood: 0, ore: 1 });
    expect(p2.hand).toMatchObject({ wood: 2, ore: 0 });
    expect(accepted.state.tradeOffers.size).toBe(0);
  });

  it("re-validates ownership at accept time, not just propose time", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    const tradeId = [...proposed.state.tradeOffers.keys()][0]!;

    // p1 spends their wood on something else before the trade is accepted.
    const drainedState = {
      ...proposed.state,
      players: proposed.state.players.map((p) =>
        p.id === "p1" ? { ...p, hand: { ...p.hand, wood: 0 } } : p,
      ),
    };
    const accepted = applyAction([BASE_MODULE], drainedState, {
      type: "ACCEPT_TRADE",
      playerId: "p2",
      tradeId,
    });
    expect(accepted).toMatchObject({ code: "INSUFFICIENT_RESOURCES" });
  });

  it("rejects a player not addressed by a targeted trade", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: ["p2"],
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    const tradeId = [...proposed.state.tradeOffers.keys()][0]!;
    const result = applyAction([BASE_MODULE], proposed.state, {
      type: "ACCEPT_TRADE",
      playerId: "p1",
      tradeId,
    });
    expect(result).toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("REJECT_TRADE", () => {
  it("removes the offer once every eligible responder has rejected it", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    const tradeId = [...proposed.state.tradeOffers.keys()][0]!;
    const rejected = applyAction([BASE_MODULE], proposed.state, {
      type: "REJECT_TRADE",
      playerId: "p2",
      tradeId,
    });
    expect(isRuleError(rejected)).toBe(false);
    if (isRuleError(rejected)) return;
    expect(rejected.state.tradeOffers.size).toBe(0);
  });
});

describe("COUNTER_TRADE", () => {
  it("closes the original offer and opens a new one addressed back to the proposer", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 2 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    const originalId = [...proposed.state.tradeOffers.keys()][0]!;

    const countered = applyAction([BASE_MODULE], proposed.state, {
      type: "COUNTER_TRADE",
      playerId: "p2",
      tradeId: originalId,
      offering: { ore: 2 },
      requesting: { wood: 2 },
    });
    expect(isRuleError(countered)).toBe(false);
    if (isRuleError(countered)) return;
    expect(countered.state.tradeOffers.has(originalId)).toBe(false);
    expect(countered.state.tradeOffers.size).toBe(1);
    const newOffer = [...countered.state.tradeOffers.values()][0]!;
    expect(newOffer.proposerId).toBe("p2");
    expect(newOffer.targetPlayerIds).toEqual(["p1"]);
  });
});

describe("CANCEL_TRADE", () => {
  it("only the proposer can cancel their own offer", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    const tradeId = [...proposed.state.tradeOffers.keys()][0]!;

    const wrongCanceler = applyAction([BASE_MODULE], proposed.state, {
      type: "CANCEL_TRADE",
      playerId: "p2",
      tradeId,
    });
    expect(wrongCanceler).toMatchObject({ code: "NOT_YOUR_TRADE" });

    const cancelled = applyAction([BASE_MODULE], proposed.state, {
      type: "CANCEL_TRADE",
      playerId: "p1",
      tradeId,
    });
    expect(isRuleError(cancelled)).toBe(false);
    if (isRuleError(cancelled)) return;
    expect(cancelled.state.tradeOffers.size).toBe(0);
  });
});

describe("END_TURN clears open trade offers", () => {
  it("auto-expires any open trade when the proposer ends their turn", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", { ore: 1 })],
    });
    const proposed = applyAction([BASE_MODULE], state, {
      type: "PROPOSE_TRADE",
      playerId: "p1",
      offering: { wood: 2 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    if (isRuleError(proposed)) throw new Error("setup failed");
    expect(proposed.state.tradeOffers.size).toBe(1);

    const ended = applyAction([BASE_MODULE], proposed.state, { type: "END_TURN", playerId: "p1" });
    expect(isRuleError(ended)).toBe(false);
    if (isRuleError(ended)) return;
    expect(ended.state.tradeOffers.size).toBe(0);
  });
});

describe("bestMaritimeRatio", () => {
  it("defaults to 4:1 with no port access", () => {
    const state = testGameState();
    expect(bestMaritimeRatio(state, "p1", "wood")).toBe(4);
  });

  it("is 3:1 with access to a generic port", () => {
    const harborEdge = { id: "harbor-edge", hexes: [TEST_HEX.center, TEST_HEX.e] } as const;
    const [portVertex] = verticesOfEdge(harborEdge);
    const state = testGameState({
      board: { ...testGameState().board, harbors: [{ edge: harborEdge, type: "generic" }] },
      buildings: new Map([[portVertex.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(bestMaritimeRatio(state, "p1", "wood")).toBe(3);
  });

  it("is 2:1 with access to a matching resource port", () => {
    const harborEdge = { id: "harbor-edge", hexes: [TEST_HEX.center, TEST_HEX.e] } as const;
    const [portVertex] = verticesOfEdge(harborEdge);
    const state = testGameState({
      board: { ...testGameState().board, harbors: [{ edge: harborEdge, type: "wood" }] },
      buildings: new Map([[portVertex.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(bestMaritimeRatio(state, "p1", "wood")).toBe(2);
  });

  it("a resource-specific port doesn't help trading a different resource", () => {
    const harborEdge = { id: "harbor-edge", hexes: [TEST_HEX.center, TEST_HEX.e] } as const;
    const [portVertex] = verticesOfEdge(harborEdge);
    const state = testGameState({
      board: { ...testGameState().board, harbors: [{ edge: harborEdge, type: "wood" }] },
      buildings: new Map([[portVertex.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(bestMaritimeRatio(state, "p1", "ore")).toBe(4);
  });
});

describe("MARITIME_TRADE", () => {
  it("trades at the 4:1 bank rate with no port access", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 4 }), playerWithHand("p2", {})],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "MARITIME_TRADE",
      playerId: "p1",
      give: "wood",
      get: "ore",
    });
    expect(isRuleError(result)).toBe(false);
    if (isRuleError(result)) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toMatchObject({ wood: 0, ore: 1 });
    expect(result.state.bank.wood).toBe(state.bank.wood + 4);
    expect(result.state.bank.ore).toBe(state.bank.ore - 1);
  });

  it("rejects trading without enough of the given resource", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 2 }), playerWithHand("p2", {})],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "MARITIME_TRADE",
      playerId: "p1",
      give: "wood",
      get: "ore",
    });
    expect(result).toMatchObject({ code: "INSUFFICIENT_RESOURCES" });
  });

  it("rejects trading a resource for itself", () => {
    const state = testGameState({
      players: [playerWithHand("p1", { wood: 4 }), playerWithHand("p2", {})],
    });
    const result = applyAction([BASE_MODULE], state, {
      type: "MARITIME_TRADE",
      playerId: "p1",
      give: "wood",
      get: "wood",
    });
    expect(result).toMatchObject({ code: "SAME_RESOURCE" });
  });
});
