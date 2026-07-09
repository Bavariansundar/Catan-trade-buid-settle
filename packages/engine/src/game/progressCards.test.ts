import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfEdge, verticesOfHex } from "../coordinates.js";
import {
  drawProgressCardsForTrack,
  playProgressCard,
  validatePlayProgressCard,
} from "./progressCards.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_SETTLED = verticesOfHex(TEST_HEX.center)[0]!;
const ROAD_EDGE = edgesOfVertex(V_SETTLED)[0];
const V_FAR = verticesOfEdge(ROAD_EDGE).find((v) => v.id !== V_SETTLED.id)!;
const FREE_EDGE = edgesOfVertex(V_FAR).find((e) => e.id !== ROAD_EDGE.id)!;

describe("drawProgressCardsForTrack", () => {
  it("draws for every player with level >= 1 in that track, skipping level 0", () => {
    const state = testGameState({
      tradeDeck: ["bazaar", "windfall"],
      players: testGameState().players.map((p) =>
        p.id === "p1" ? { ...p, cityImprovements: { trade: 1, politics: 0, science: 0 } } : p,
      ),
    });
    const result = drawProgressCardsForTrack(state, "trade");
    expect(result.events).toEqual([
      { type: "PROGRESS_CARD_DRAWN", playerId: "p1", deck: "trade", card: "bazaar" },
    ]);
    expect(result.state.tradeDeck).toEqual(["windfall"]);
    expect(result.state.players.find((p) => p.id === "p1")!.progressCards).toEqual([
      { type: "bazaar" },
    ]);
  });

  it("scores a landmark as immediate VP instead of a playable card", () => {
    const state = testGameState({
      tradeDeck: ["harbor_master"],
      players: testGameState().players.map((p) =>
        p.id === "p1" ? { ...p, cityImprovements: { trade: 1, politics: 0, science: 0 } } : p,
      ),
    });
    const result = drawProgressCardsForTrack(state, "trade");
    expect(result.events).toEqual([
      { type: "LANDMARK_ACQUIRED", playerId: "p1", card: "harbor_master" },
    ]);
    expect(result.state.players.find((p) => p.id === "p1")!.landmarks).toEqual(["harbor_master"]);
    expect(result.state.players.find((p) => p.id === "p1")!.progressCards).toEqual([]);
  });

  it("is a no-op once the deck is empty", () => {
    const state = testGameState({
      tradeDeck: [],
      players: testGameState().players.map((p) =>
        p.id === "p1" ? { ...p, cityImprovements: { trade: 1, politics: 0, science: 0 } } : p,
      ),
    });
    const result = drawProgressCardsForTrack(state, "trade");
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });
});

function withHandAndCard(
  card: string,
  hand: Partial<Record<"wood" | "wheat" | "sheep" | "brick" | "ore", number>> = {},
) {
  return testGameState({
    players: testGameState().players.map((p) =>
      p.id === "p1"
        ? {
            ...p,
            hand: { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0, ...hand },
            progressCards: [{ type: card as never }],
          }
        : p,
    ),
  });
}

describe("PLAY_PROGRESS_CARD — bazaar", () => {
  it("trades 2:1 with the bank immediately", () => {
    const state = withHandAndCard("bazaar", { wood: 2 });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "bazaar" as const,
      playerId: "p1",
      give: "wood" as const,
      get: "ore" as const,
    };
    expect(validatePlayProgressCard(state, action)).toBeNull();
    const result = playProgressCard(state, action);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.wood).toBe(0);
    expect(p1.hand.ore).toBe(1);
    expect(p1.progressCards).toEqual([]);
  });

  it("rejects without 2 of the given resource", () => {
    const state = withHandAndCard("bazaar", { wood: 1 });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "bazaar" as const,
      playerId: "p1",
      give: "wood" as const,
      get: "ore" as const,
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({
      code: "INSUFFICIENT_RESOURCES",
    });
  });
});

describe("PLAY_PROGRESS_CARD — windfall", () => {
  it("takes 1 of the named resource from every other player who has any", () => {
    const state = testGameState({
      players: [
        { ...testGameState().players[0]!, progressCards: [{ type: "windfall" }] },
        { ...testGameState().players[1]!, hand: { wood: 1, wheat: 0, sheep: 0, brick: 0, ore: 0 } },
      ],
    });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "windfall" as const,
      playerId: "p1",
      resource: "wood" as const,
    };
    const result = playProgressCard(state, action);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.wood).toBe(1);
    expect(result.state.players.find((p) => p.id === "p2")!.hand.wood).toBe(0);
  });
});

describe("PLAY_PROGRESS_CARD — mobilize", () => {
  it("activates every one of the player's own knights for free", () => {
    const state = withHandAndCard("mobilize");
    const withKnights = {
      ...state,
      knights: new Map([
        ["v1", { playerId: "p1", level: 1 as const, active: false }],
        ["v2", { playerId: "p2", level: 1 as const, active: false }],
      ]),
    };
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "mobilize" as const,
      playerId: "p1",
    };
    const result = playProgressCard(withKnights, action);
    expect(result.state.knights.get("v1")!.active).toBe(true);
    expect(result.state.knights.get("v2")!.active).toBe(false);
  });
});

describe("PLAY_PROGRESS_CARD — bribery", () => {
  it("steals 1 commodity of the chosen type from the target", () => {
    const state = testGameState({
      players: [
        { ...testGameState().players[0]!, progressCards: [{ type: "bribery" }] },
        { ...testGameState().players[1]!, commodities: { cloth: 2, coin: 0, paper: 0 } },
      ],
    });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "bribery" as const,
      playerId: "p1",
      targetPlayerId: "p2",
      commodity: "cloth" as const,
    };
    expect(validatePlayProgressCard(state, action)).toBeNull();
    const result = playProgressCard(state, action);
    expect(result.state.players.find((p) => p.id === "p1")!.commodities.cloth).toBe(1);
    expect(result.state.players.find((p) => p.id === "p2")!.commodities.cloth).toBe(1);
  });

  it("rejects stealing from a target with none of that commodity", () => {
    const state = testGameState({
      players: [
        { ...testGameState().players[0]!, progressCards: [{ type: "bribery" }] },
        testGameState().players[1]!,
      ],
    });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "bribery" as const,
      playerId: "p1",
      targetPlayerId: "p2",
      commodity: "cloth" as const,
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({ code: "NOTHING_TO_STEAL" });
  });
});

describe("PLAY_PROGRESS_CARD — sabotage", () => {
  it("deactivates a chosen opponent's active knight", () => {
    const state = testGameState({
      players: [
        { ...testGameState().players[0]!, progressCards: [{ type: "sabotage" }] },
        testGameState().players[1]!,
      ],
      knights: new Map([["v1", { playerId: "p2", level: 1 as const, active: true }]]),
    });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "sabotage" as const,
      playerId: "p1",
      targetPlayerId: "p2",
      targetVertex: V_SETTLED,
    };
    // Use the actual knight's vertex id via a state where V_SETTLED.id === "v1"'s stand-in.
    const stateAtVertex = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p2", level: 1 as const, active: true }]]),
    };
    expect(validatePlayProgressCard(stateAtVertex, action)).toBeNull();
    const result = playProgressCard(stateAtVertex, action);
    expect(result.state.knights.get(V_SETTLED.id)!.active).toBe(false);
  });

  it("rejects targeting a vertex without an active knight", () => {
    const state = testGameState({
      players: [
        { ...testGameState().players[0]!, progressCards: [{ type: "sabotage" }] },
        testGameState().players[1]!,
      ],
    });
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "sabotage" as const,
      playerId: "p1",
      targetPlayerId: "p2",
      targetVertex: V_SETTLED,
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({ code: "NOT_AN_ACTIVE_KNIGHT" });
  });
});

describe("PLAY_PROGRESS_CARD — blueprint", () => {
  it("builds free roads that must still legally connect", () => {
    const state = withHandAndCard("blueprint");
    const connected = { ...state, roads: new Map([[ROAD_EDGE.id, "p1"]]) };
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "blueprint" as const,
      playerId: "p1",
      edges: [FREE_EDGE],
    };
    expect(validatePlayProgressCard(connected, action)).toBeNull();
    const result = playProgressCard(connected, action);
    expect(result.state.roads.get(FREE_EDGE.id)).toBe("p1");
  });

  it("rejects a road that doesn't connect to the player's network", () => {
    const state = withHandAndCard("blueprint");
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "blueprint" as const,
      playerId: "p1",
      edges: [FREE_EDGE],
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({ code: "NOT_CONNECTED" });
  });
});

describe("PLAY_PROGRESS_CARD — breakthrough", () => {
  it("raises a track by 1 for free, requiring the player owns a city", () => {
    const state = withHandAndCard("breakthrough");
    const withCity = {
      ...state,
      buildings: new Map([[V_SETTLED.id, { playerId: "p1", type: "city" as const }]]),
    };
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "breakthrough" as const,
      playerId: "p1",
      track: "science" as const,
    };
    expect(validatePlayProgressCard(withCity, action)).toBeNull();
    const result = playProgressCard(withCity, action);
    expect(result.state.players.find((p) => p.id === "p1")!.cityImprovements.science).toBe(1);
  });

  it("rejects without owning a city", () => {
    const state = withHandAndCard("breakthrough");
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "breakthrough" as const,
      playerId: "p1",
      track: "science" as const,
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({ code: "NO_CITY" });
  });
});

describe("PLAY_PROGRESS_CARD — apprentice", () => {
  it("banks a discount credit for the next track upgrade", () => {
    const state = withHandAndCard("apprentice");
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "apprentice" as const,
      playerId: "p1",
    };
    const result = playProgressCard(state, action);
    expect(result.state.players.find((p) => p.id === "p1")!.apprenticeCredit).toBe(true);
  });
});

describe("validatePlayProgressCard — common gating", () => {
  it("rejects playing a card the player doesn't hold", () => {
    const state = testGameState();
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "apprentice" as const,
      playerId: "p1",
    };
    expect(validatePlayProgressCard(state, action)).toMatchObject({ code: "CARD_NOT_PLAYABLE" });
  });

  it("rejects playing outside the main phase", () => {
    const state = withHandAndCard("apprentice");
    const outsideMain = { ...state, phase: { name: "roll" as const } };
    const action = {
      type: "PLAY_PROGRESS_CARD" as const,
      card: "apprentice" as const,
      playerId: "p1",
    };
    expect(validatePlayProgressCard(outsideMain, action)).toMatchObject({ code: "WRONG_PHASE" });
  });
});
