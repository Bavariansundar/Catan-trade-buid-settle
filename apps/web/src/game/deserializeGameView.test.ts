import { describe, expect, it } from "vitest";
import { deserializeGameView } from "./deserializeGameView.js";

describe("deserializeGameView", () => {
  it("reconstructs Map fields from the array-of-entries wire shape", () => {
    const wire = {
      board: { tiles: [], harbors: [] },
      players: [],
      bank: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
      buildings: [["v1", { playerId: "a", type: "settlement" }]],
      roads: [["e1", "a"]],
      tradeOffers: [],
      publicVictoryPoints: [["a", 2]],
      robber: { q: 0, r: 0 },
      currentPlayerIndex: 0,
      phase: { name: "main" },
      diceRoll: null,
      devDeckCount: 25,
      turnNumber: 1,
      longestRoadPlayerId: null,
      largestArmyPlayerId: null,
      targetVictoryPoints: 10,
    };

    const view = deserializeGameView(JSON.parse(JSON.stringify(wire)));

    expect(view.buildings).toBeInstanceOf(Map);
    expect(view.buildings.get("v1")).toEqual({ playerId: "a", type: "settlement" });
    expect(view.roads.get("e1")).toBe("a");
    expect(view.publicVictoryPoints.get("a")).toBe(2);
    expect(view.tradeOffers.size).toBe(0);
  });

  it("reconstructs the nested pending Map when phase is discard", () => {
    const wire = {
      board: { tiles: [], harbors: [] },
      players: [],
      bank: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
      buildings: [],
      roads: [],
      tradeOffers: [],
      publicVictoryPoints: [],
      robber: { q: 0, r: 0 },
      currentPlayerIndex: 0,
      phase: { name: "discard", pending: [["p1", 4]] },
      diceRoll: null,
      devDeckCount: 25,
      turnNumber: 1,
      longestRoadPlayerId: null,
      largestArmyPlayerId: null,
      targetVictoryPoints: 10,
    };

    const view = deserializeGameView(JSON.parse(JSON.stringify(wire)));

    expect(view.phase.name).toBe("discard");
    if (view.phase.name !== "discard") throw new Error("expected discard phase");
    expect(view.phase.pending).toBeInstanceOf(Map);
    expect(view.phase.pending.get("p1")).toBe(4);
  });
});
