import { describe, expect, it } from "vitest";
import { BASE_MODULE } from "./modules/base.js";
import { redactEventsFor, viewFor } from "./view.js";
import { testGameState } from "./testFixtures.js";
import type {
  DevCardBoughtEvent,
  DiscardedEvent,
  ProgressCardDrawnEvent,
  ResourceStolenEvent,
  TurnStartedEvent,
} from "./types.js";

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

describe("redactEventsFor", () => {
  it("shows the discarding player their own discarded resources", () => {
    const event: DiscardedEvent = {
      type: "DISCARDED",
      playerId: "p1",
      resources: { wood: 2, brick: 1 },
    };
    const [redacted] = redactEventsFor([event], "p1");
    expect(redacted).toEqual(event);
  });

  it("hides another player's discarded resources", () => {
    const event: DiscardedEvent = {
      type: "DISCARDED",
      playerId: "p1",
      resources: { wood: 2, brick: 1 },
    };
    const [redacted] = redactEventsFor([event], "p2");
    expect(redacted).toEqual({ type: "DISCARDED", playerId: "p1" });
    expect(redacted).not.toHaveProperty("resources");
  });

  it("hides discarded resources from a spectator (null viewer)", () => {
    const event: DiscardedEvent = { type: "DISCARDED", playerId: "p1", resources: { ore: 1 } };
    const [redacted] = redactEventsFor([event], null);
    expect(redacted).not.toHaveProperty("resources");
  });

  it("shows the stolen resource type to the thief and the victim, hides it from everyone else", () => {
    const event: ResourceStolenEvent = {
      type: "RESOURCE_STOLEN",
      thiefId: "p1",
      victimId: "p2",
      resource: "ore",
    };
    expect(redactEventsFor([event], "p1")[0]).toEqual(event);
    expect(redactEventsFor([event], "p2")[0]).toEqual(event);
    const [redactedForBystander] = redactEventsFor([event], "p3");
    expect(redactedForBystander).toEqual({
      type: "RESOURCE_STOLEN",
      thiefId: "p1",
      victimId: "p2",
    });
    expect(redactedForBystander).not.toHaveProperty("resource");
  });

  it("hides which dev card was bought from everyone but the buyer", () => {
    const event: DevCardBoughtEvent = { type: "DEV_CARD_BOUGHT", playerId: "p1", card: "knight" };
    expect(redactEventsFor([event], "p1")[0]).toEqual(event);
    const [redacted] = redactEventsFor([event], "p2");
    expect(redacted).toEqual({ type: "DEV_CARD_BOUGHT", playerId: "p1" });
    expect(redacted).not.toHaveProperty("card");
  });

  it("hides which progress card was drawn from everyone but the drawer", () => {
    const event: ProgressCardDrawnEvent = {
      type: "PROGRESS_CARD_DRAWN",
      playerId: "p1",
      deck: "trade",
      card: "bazaar",
    };
    expect(redactEventsFor([event], "p1")[0]).toEqual(event);
    const [redacted] = redactEventsFor([event], "p2");
    expect(redacted).toEqual({ type: "PROGRESS_CARD_DRAWN", playerId: "p1", deck: "trade" });
    expect(redacted).not.toHaveProperty("card");
  });

  it("passes every other event type through unchanged, for any viewer", () => {
    const event: TurnStartedEvent = { type: "TURN_STARTED", playerId: "p1" };
    expect(redactEventsFor([event], "p2")[0]).toEqual(event);
    expect(redactEventsFor([event], null)[0]).toEqual(event);
  });
});
