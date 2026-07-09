import { describe, expect, it } from "vitest";
import { edgeAt, edgesOfVertex, vertexAt } from "../coordinates.js";
import {
  buildShip,
  hasShipConnectivity,
  isBlockedByPirate,
  isEdgeInPlayArea,
  isLandEdge,
  isOpenShip,
  isSeaEdge,
  moveShip,
  validateBuildShip,
  validateMoveShip,
} from "./ships.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import type { GameState } from "./types.js";

// Two sea hexes beyond the 7-hex TEST_HEX land blob, directly east — enough
// room that every edge around the coastal vertex used below is a genuine
// sea edge (verified via isSeaEdge in the tests themselves, not assumed).
const SEA_HEX = { q: 2, r: 0 };
const SEA_HEX_2 = { q: 2, r: -1 };

function seafaringState(overrides: Partial<GameState> = {}): GameState {
  const base = testGameState();
  return {
    ...base,
    board: { ...base.board, seaHexes: [SEA_HEX, SEA_HEX_2] },
    players: base.players.map((p) => ({ ...p, pieces: { ...p.pieces, ships: 15 } })),
    ...overrides,
  };
}

// Coastal edge between TEST_HEX.e (land) and SEA_HEX (sea) — ship-eligible.
const COASTAL_EDGE = edgeAt(TEST_HEX.e, 0); // E direction from TEST_HEX.e lands on SEA_HEX

describe("isSeaEdge / isLandEdge", () => {
  it("a coastal edge (land+sea) is a sea edge, not a land edge", () => {
    const state = seafaringState();
    expect(isSeaEdge(state, COASTAL_EDGE)).toBe(true);
    expect(isLandEdge(state, COASTAL_EDGE)).toBe(false);
  });

  it("a pure land edge is a land edge, not a sea edge", () => {
    const state = seafaringState();
    const landEdge = edgesOfVertex(vertexAt(TEST_HEX.center, 0))[0];
    expect(isLandEdge(state, landEdge)).toBe(true);
    expect(isSeaEdge(state, landEdge)).toBe(false);
  });

  it("an edge touching the play area (land or sea) is in bounds", () => {
    const state = seafaringState();
    expect(isEdgeInPlayArea(state, COASTAL_EDGE)).toBe(true);
  });
});

describe("isBlockedByPirate", () => {
  it("blocks an edge whose hexes include the pirate hex", () => {
    const state = seafaringState({ pirateHex: SEA_HEX });
    expect(isBlockedByPirate(state, COASTAL_EDGE)).toBe(true);
  });

  it("does not block an edge unrelated to the pirate hex", () => {
    const state = seafaringState({ pirateHex: SEA_HEX });
    const landEdge = edgesOfVertex(vertexAt(TEST_HEX.center, 0))[0];
    expect(isBlockedByPirate(state, landEdge)).toBe(false);
  });

  it("blocks nothing when there is no pirate", () => {
    const state = seafaringState({ pirateHex: null });
    expect(isBlockedByPirate(state, COASTAL_EDGE)).toBe(false);
  });
});

describe("hasShipConnectivity", () => {
  const V_COAST = vertexAt(TEST_HEX.e, 0); // an endpoint of COASTAL_EDGE

  it("connects via the player's own settlement at an endpoint", () => {
    const state = seafaringState({
      buildings: new Map([[V_COAST.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(hasShipConnectivity(state, "p1", COASTAL_EDGE)).toBe(true);
  });

  it("connects via the player's own existing ship at an endpoint", () => {
    const otherSeaEdge = edgesOfVertex(V_COAST).find((e) => e.id !== COASTAL_EDGE.id)!;
    const state = seafaringState({ ships: new Map([[otherSeaEdge.id, "p1"]]) });
    expect(hasShipConnectivity(state, "p1", COASTAL_EDGE)).toBe(true);
  });

  it("does NOT connect via a bare road at the endpoint (no settlement/city there)", () => {
    const otherEdge = edgesOfVertex(V_COAST).find((e) => e.id !== COASTAL_EDGE.id)!;
    const state = seafaringState({ roads: new Map([[otherEdge.id, "p1"]]) });
    expect(hasShipConnectivity(state, "p1", COASTAL_EDGE)).toBe(false);
  });

  it("does not connect when nothing of the player's is nearby", () => {
    const state = seafaringState();
    expect(hasShipConnectivity(state, "p1", COASTAL_EDGE)).toBe(false);
  });
});

describe("validateBuildShip / buildShip", () => {
  const V_COAST = vertexAt(TEST_HEX.e, 0);

  function connectedState(): GameState {
    return seafaringState({
      buildings: new Map([[V_COAST.id, { playerId: "p1", type: "settlement" as const }]]),
      players: [
        {
          ...testGameState().players[0]!,
          id: "p1",
          hand: { wood: 1, sheep: 1, wheat: 0, brick: 0, ore: 0 },
          pieces: { ...testGameState().players[0]!.pieces, ships: 15 },
        },
        testGameState().players[1]!,
      ],
    });
  }

  it("builds a ship on a connected, legal sea edge", () => {
    const state = connectedState();
    expect(validateBuildShip(state, "p1", COASTAL_EDGE)).toBeNull();
    const result = buildShip(state, "p1", COASTAL_EDGE);
    expect(result.ships.get(COASTAL_EDGE.id)).toBe("p1");
    const p1 = result.players.find((p) => p.id === "p1")!;
    expect(p1.pieces.ships).toBe(14);
    expect(p1.hand).toEqual({ wood: 0, sheep: 0, wheat: 0, brick: 0, ore: 0 });
  });

  it("rejects a ship on a land edge", () => {
    const state = connectedState();
    const landEdge = edgesOfVertex(vertexAt(TEST_HEX.center, 0))[0];
    expect(validateBuildShip(state, "p1", landEdge)).toMatchObject({ code: "NOT_A_SEA_EDGE" });
  });

  it("rejects a ship not connected to the player's network", () => {
    const state = seafaringState();
    expect(validateBuildShip(state, "p1", COASTAL_EDGE)).toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("rejects a ship adjacent to the pirate", () => {
    const state = { ...connectedState(), pirateHex: SEA_HEX };
    expect(validateBuildShip(state, "p1", COASTAL_EDGE)).toMatchObject({
      code: "BLOCKED_BY_PIRATE",
    });
  });

  it("rejects a ship on an already-occupied edge", () => {
    const state = { ...connectedState(), ships: new Map([[COASTAL_EDGE.id, "p2"]]) };
    expect(validateBuildShip(state, "p1", COASTAL_EDGE)).toMatchObject({ code: "EDGE_OCCUPIED" });
  });

  it("rejects when the player has no ship pieces left", () => {
    const state = connectedState();
    const depleted = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, pieces: { ...p.pieces, ships: 0 } } : p,
      ),
    };
    expect(validateBuildShip(depleted, "p1", COASTAL_EDGE)).toMatchObject({
      code: "NO_PIECES_LEFT",
    });
  });

  it("rejects when the player cannot afford a ship", () => {
    const state = connectedState();
    const broke = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, hand: { wood: 0, sheep: 0, wheat: 0, brick: 0, ore: 0 } } : p,
      ),
    };
    expect(validateBuildShip(broke, "p1", COASTAL_EDGE)).toMatchObject({ code: "CANNOT_AFFORD" });
  });
});

describe("isOpenShip", () => {
  const V_COAST = vertexAt(TEST_HEX.e, 0);
  const otherSeaEdge = edgesOfVertex(V_COAST).find((e) => e.id !== COASTAL_EDGE.id)!;

  it("is open when isolated (touches nothing else of the player's)", () => {
    const state = seafaringState({ ships: new Map([[COASTAL_EDGE.id, "p1"]]) });
    expect(isOpenShip(state, "p1", COASTAL_EDGE)).toBe(true);
  });

  it("is NOT open when adjacent to the player's own settlement", () => {
    const state = seafaringState({
      ships: new Map([[COASTAL_EDGE.id, "p1"]]),
      buildings: new Map([[V_COAST.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(isOpenShip(state, "p1", COASTAL_EDGE)).toBe(false);
  });

  it("is still open when connected at only ONE endpoint", () => {
    const state = seafaringState({
      ships: new Map([
        [COASTAL_EDGE.id, "p1"],
        [otherSeaEdge.id, "p1"],
      ]),
    });
    expect(isOpenShip(state, "p1", COASTAL_EDGE)).toBe(true);
  });

  it("is NOT open when connected to another of the player's ships at BOTH endpoints", () => {
    const V_FAR = vertexAt(TEST_HEX.e, 5); // COASTAL_EDGE's other endpoint
    const farSeaEdge = edgesOfVertex(V_FAR).find(
      (e) => e.id !== COASTAL_EDGE.id && isSeaEdge(seafaringState(), e),
    )!;
    const state = seafaringState({
      ships: new Map([
        [COASTAL_EDGE.id, "p1"],
        [otherSeaEdge.id, "p1"], // connects V_COAST
        [farSeaEdge.id, "p1"], // connects V_FAR
      ]),
    });
    expect(isOpenShip(state, "p1", COASTAL_EDGE)).toBe(false);
  });
});

describe("validateMoveShip / moveShip", () => {
  const V_COAST = vertexAt(TEST_HEX.e, 0);
  const otherSeaEdge = edgesOfVertex(V_COAST).find((e) => e.id !== COASTAL_EDGE.id)!;
  // otherSeaEdge's OTHER endpoint (not V_COAST) — doesn't touch COASTAL_EDGE
  // at all, so anchoring a settlement here keeps COASTAL_EDGE open while
  // still giving the move destination something legitimate to connect to.
  const V_ANCHOR = vertexAt(TEST_HEX.e, 1);

  function baseState(): GameState {
    return seafaringState({
      ships: new Map([[COASTAL_EDGE.id, "p1"]]),
      buildings: new Map([[V_ANCHOR.id, { playerId: "p1", type: "settlement" as const }]]),
    });
  }

  it("moves an open ship to a new legal sea edge", () => {
    const state = baseState();
    expect(isOpenShip(state, "p1", COASTAL_EDGE)).toBe(true);
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, otherSeaEdge)).toBeNull();
    const result = moveShip(state, "p1", COASTAL_EDGE, otherSeaEdge);
    expect(result.ships.has(COASTAL_EDGE.id)).toBe(false);
    expect(result.ships.get(otherSeaEdge.id)).toBe("p1");
    expect(result.players.find((p) => p.id === "p1")!.shipMovedThisTurn).toBe(true);
  });

  it("rejects moving a ship the player doesn't own", () => {
    const state = seafaringState({ ships: new Map([[COASTAL_EDGE.id, "p2"]]) });
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, otherSeaEdge)).toMatchObject({
      code: "NOT_YOUR_SHIP",
    });
  });

  it("rejects a second move in the same turn", () => {
    const state = {
      ...baseState(),
      players: baseState().players.map((p) =>
        p.id === "p1" ? { ...p, shipMovedThisTurn: true } : p,
      ),
    };
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, otherSeaEdge)).toMatchObject({
      code: "ALREADY_MOVED",
    });
  });

  it("rejects moving a ship that isn't open (adjacent to own settlement)", () => {
    const state = {
      ...baseState(),
      buildings: new Map([[V_COAST.id, { playerId: "p1", type: "settlement" as const }]]),
    };
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, otherSeaEdge)).toMatchObject({
      code: "SHIP_NOT_OPEN",
    });
  });

  it("rejects moving onto an occupied edge", () => {
    const state = {
      ...baseState(),
      ships: new Map([
        [COASTAL_EDGE.id, "p1"],
        [otherSeaEdge.id, "p2"],
      ]),
    };
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, otherSeaEdge)).toMatchObject({
      code: "EDGE_OCCUPIED",
    });
  });

  it("rejects moving a ship onto a land edge", () => {
    const state = baseState();
    const landEdge = edgesOfVertex(vertexAt(TEST_HEX.center, 0))[0];
    expect(validateMoveShip(state, "p1", COASTAL_EDGE, landEdge)).toMatchObject({
      code: "NOT_A_SEA_EDGE",
    });
  });
});
