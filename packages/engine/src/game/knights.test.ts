import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfEdge, verticesOfHex } from "../coordinates.js";
import {
  activateKnight,
  buyKnight,
  chaseRobber,
  hasKnightConnectivity,
  moveKnight,
  promoteKnight,
  validateActivateKnight,
  validateBuyKnight,
  validateChaseRobber,
  validateMoveKnight,
  validatePromoteKnight,
} from "./knights.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_SETTLED = verticesOfHex(TEST_HEX.center)[0]!;
const ROAD_EDGE = edgesOfVertex(V_SETTLED)[0];
const V_EMPTY_CONNECTED = verticesOfEdge(ROAD_EDGE).find((v) => v.id !== V_SETTLED.id)!;
const V_DISCONNECTED = verticesOfHex(TEST_HEX.se)[4]!;

function baseState() {
  return testGameState({
    buildings: new Map([[V_SETTLED.id, { playerId: "p1", type: "settlement" }]]),
    roads: new Map([[ROAD_EDGE.id, "p1"]]),
    players: testGameState().players.map((p) =>
      p.id === "p1"
        ? {
            ...p,
            hand: { wood: 0, wheat: 5, sheep: 1, brick: 0, ore: 1 },
            pieces: { ...p.pieces, knights: 3 },
          }
        : p,
    ),
  });
}

describe("validateBuyKnight / buyKnight", () => {
  it("builds a basic inactive knight connected to the player's own building", () => {
    const state = baseState();
    expect(
      validateBuyKnight(state, { type: "BUY_KNIGHT", playerId: "p1", vertex: V_SETTLED }),
    ).toBeNull();
    const result = buyKnight(state, { type: "BUY_KNIGHT", playerId: "p1", vertex: V_SETTLED });
    const knight = result.state.knights.get(V_SETTLED.id);
    expect(knight).toEqual({ playerId: "p1", level: 1, active: false });
  });

  it("rejects a vertex not connected to the player's network", () => {
    const state = baseState();
    expect(
      validateBuyKnight(state, { type: "BUY_KNIGHT", playerId: "p1", vertex: V_DISCONNECTED }),
    ).toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("rejects when the player has no knight pieces left", () => {
    const state = baseState();
    const noPieces = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, pieces: { ...p.pieces, knights: 0 } } : p,
      ),
    };
    expect(
      validateBuyKnight(noPieces, { type: "BUY_KNIGHT", playerId: "p1", vertex: V_SETTLED }),
    ).toMatchObject({ code: "NO_PIECES_LEFT" });
  });
});

describe("validateActivateKnight / activateKnight", () => {
  it("activates an inactive knight for 1 wheat", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }]]),
    };
    expect(
      validateActivateKnight(withKnight, {
        type: "ACTIVATE_KNIGHT",
        playerId: "p1",
        vertex: V_SETTLED,
      }),
    ).toBeNull();
    const result = activateKnight(withKnight, {
      type: "ACTIVATE_KNIGHT",
      playerId: "p1",
      vertex: V_SETTLED,
    });
    expect(result.state.knights.get(V_SETTLED.id)!.active).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.wheat).toBe(4);
  });

  it("rejects activating an already-active knight", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: true }]]),
    };
    expect(
      validateActivateKnight(withKnight, {
        type: "ACTIVATE_KNIGHT",
        playerId: "p1",
        vertex: V_SETTLED,
      }),
    ).toMatchObject({ code: "ALREADY_ACTIVE" });
  });
});

describe("validatePromoteKnight / promoteKnight", () => {
  it("rejects promotion when the Politics track is too low", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }]]),
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, commodities: { cloth: 0, coin: 5, paper: 0 } } : p,
      ),
    };
    expect(
      validatePromoteKnight(withKnight, {
        type: "PROMOTE_KNIGHT",
        playerId: "p1",
        vertex: V_SETTLED,
      }),
    ).toMatchObject({ code: "POLITICS_TOO_LOW" });
  });

  it("promotes to Strong for 1 coin once Politics >= 2", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }]]),
      players: state.players.map((p) =>
        p.id === "p1"
          ? {
              ...p,
              commodities: { cloth: 0, coin: 5, paper: 0 },
              cityImprovements: { trade: 0, politics: 2, science: 0 },
            }
          : p,
      ),
    };
    expect(
      validatePromoteKnight(withKnight, {
        type: "PROMOTE_KNIGHT",
        playerId: "p1",
        vertex: V_SETTLED,
      }),
    ).toBeNull();
    const result = promoteKnight(withKnight, {
      type: "PROMOTE_KNIGHT",
      playerId: "p1",
      vertex: V_SETTLED,
    });
    expect(result.state.knights.get(V_SETTLED.id)!.level).toBe(2);
    expect(result.state.players.find((p) => p.id === "p1")!.commodities.coin).toBe(4);
  });
});

describe("validateMoveKnight / moveKnight", () => {
  it("moves a knight to another connected, empty vertex", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }]]),
    };
    expect(hasKnightConnectivity(withKnight, "p1", V_EMPTY_CONNECTED)).toBe(true);
    const action = {
      type: "MOVE_KNIGHT" as const,
      playerId: "p1",
      fromVertex: V_SETTLED,
      toVertex: V_EMPTY_CONNECTED,
    };
    expect(validateMoveKnight(withKnight, action)).toBeNull();
    const result = moveKnight(withKnight, action);
    expect(result.state.knights.has(V_SETTLED.id)).toBe(false);
    expect(result.state.knights.get(V_EMPTY_CONNECTED.id)).toEqual({
      playerId: "p1",
      level: 1,
      active: false,
    });
  });

  it("rejects moving onto a vertex that already has a knight", () => {
    const state = baseState();
    const withKnights = {
      ...state,
      knights: new Map([
        [V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }],
        [V_EMPTY_CONNECTED.id, { playerId: "p2", level: 1 as const, active: false }],
      ]),
    };
    const action = {
      type: "MOVE_KNIGHT" as const,
      playerId: "p1",
      fromVertex: V_SETTLED,
      toVertex: V_EMPTY_CONNECTED,
    };
    expect(validateMoveKnight(withKnights, action)).toMatchObject({ code: "VERTEX_OCCUPIED" });
  });
});

describe("validateChaseRobber / chaseRobber", () => {
  it("displaces the robber without stealing, deactivating the knight used", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      robber: TEST_HEX.center,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: true }]]),
    };
    const action = {
      type: "CHASE_ROBBER" as const,
      playerId: "p1",
      knightVertex: V_SETTLED,
      toHex: TEST_HEX.e,
    };
    expect(validateChaseRobber(withKnight, action)).toBeNull();
    const result = chaseRobber(withKnight, action);
    expect(result.state.robber).toEqual(TEST_HEX.e);
    expect(result.state.knights.get(V_SETTLED.id)!.active).toBe(false);
    expect(result.events.some((e) => e.type === "RESOURCE_STOLEN")).toBe(false);
  });

  it("rejects using an inactive knight", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      robber: TEST_HEX.center,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: false }]]),
    };
    const action = {
      type: "CHASE_ROBBER" as const,
      playerId: "p1",
      knightVertex: V_SETTLED,
      toHex: TEST_HEX.e,
    };
    expect(validateChaseRobber(withKnight, action)).toMatchObject({ code: "NOT_AN_ACTIVE_KNIGHT" });
  });

  it("rejects a knight not adjacent to the robber's hex", () => {
    const state = baseState();
    const withKnight = {
      ...state,
      robber: TEST_HEX.se,
      knights: new Map([[V_SETTLED.id, { playerId: "p1", level: 1 as const, active: true }]]),
    };
    const action = {
      type: "CHASE_ROBBER" as const,
      playerId: "p1",
      knightVertex: V_SETTLED,
      toHex: TEST_HEX.e,
    };
    expect(validateChaseRobber(withKnight, action)).toMatchObject({ code: "NOT_ADJACENT" });
  });
});
