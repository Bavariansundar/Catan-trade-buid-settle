import { describe, expect, it } from "vitest";
import { BASE_MODULE } from "./modules/base.js";
import { viewFor } from "./view.js";
import { testGameState } from "./testFixtures.js";

describe("viewFor", () => {
  it("shows the viewer's own hand and dev cards in full", () => {
    const state = testGameState({
      players: [
        {
          id: "p1",
          hand: { wood: 3, wheat: 1, sheep: 0, brick: 2, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [{ type: "knight", boughtTurn: 0 }],
          knightsPlayed: 1,
          devCardPlayedThisTurn: false,
          shipMovedThisTurn: false,
          commodities: { cloth: 0, coin: 0, paper: 0 },
          cityImprovements: { trade: 0, politics: 0, science: 0 },
          progressCards: [],
          landmarks: [],
          apprenticeCredit: false,
          barbarianDefenseWins: 0,
        },
        testGameState().players[1]!,
      ],
    });
    const view = viewFor([BASE_MODULE], state, "p1");
    const self = view.players.find((p) => p.id === "p1")!;
    expect(self.hand).toEqual({ wood: 3, wheat: 1, sheep: 0, brick: 2, ore: 0 });
    expect(self.handCount).toBe(6);
    expect(self.devCards).toEqual([{ type: "knight", boughtTurn: 0 }]);
    expect(self.devCardCount).toBe(1);
  });

  it("redacts every other player's hand and dev cards to counts only", () => {
    const state = testGameState({
      players: [
        testGameState().players[0]!,
        {
          id: "p2",
          hand: { wood: 3, wheat: 1, sheep: 0, brick: 2, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [{ type: "monopoly", boughtTurn: 0 }],
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
    const view = viewFor([BASE_MODULE], state, "p1");
    const opponent = view.players.find((p) => p.id === "p2")!;
    expect(opponent.hand).toBeNull();
    expect(opponent.handCount).toBe(6);
    expect(opponent.devCards).toBeNull();
    expect(opponent.devCardCount).toBe(1);
  });

  it("collapses the dev deck to a count with no order or contents", () => {
    const state = testGameState({ devDeck: ["knight", "monopoly", "victory_point"] });
    const view = viewFor([BASE_MODULE], state, "p1");
    expect(view.devDeckCount).toBe(3);
    expect(view).not.toHaveProperty("devDeck");
  });

  it("still exposes public info in full: board, buildings, roads, bank, awards", () => {
    const state = testGameState({ longestRoadPlayerId: "p2", largestArmyPlayerId: "p1" });
    const view = viewFor([BASE_MODULE], state, "p1");
    expect(view.board).toBe(state.board);
    expect(view.buildings).toBe(state.buildings);
    expect(view.roads).toBe(state.roads);
    expect(view.bank).toEqual(state.bank);
    expect(view.longestRoadPlayerId).toBe("p2");
    expect(view.largestArmyPlayerId).toBe("p1");
  });

  it("computes publicVictoryPoints excluding anyone's hidden VP cards", () => {
    const state = testGameState({
      players: [
        {
          id: "p1",
          hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 },
          pieces: { settlements: 5, cities: 4, roads: 15, ships: 0, knights: 0, cityWalls: 0 },
          devCards: [{ type: "victory_point", boughtTurn: 0 }],
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
        testGameState().players[1]!,
      ],
    });
    const view = viewFor([BASE_MODULE], state, "p2");
    expect(view.publicVictoryPoints.get("p1")).toBe(0);
  });

  it("knightsPlayed is visible for every player (public info)", () => {
    const state = testGameState({
      players: [{ ...testGameState().players[0]!, knightsPlayed: 2 }, testGameState().players[1]!],
    });
    const view = viewFor([BASE_MODULE], state, "p2");
    expect(view.players.find((p) => p.id === "p1")!.knightsPlayed).toBe(2);
  });
});
