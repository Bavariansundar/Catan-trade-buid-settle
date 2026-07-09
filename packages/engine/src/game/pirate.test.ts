import { describe, expect, it } from "vitest";
import { edgeAt } from "../coordinates.js";
import {
  applyPirateMovementCore,
  eligibleShipStealTargets,
  movePirate,
  validateMovePirate,
  validatePirateMovementCore,
} from "./pirate.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import type { GameState } from "./types.js";

const SEA_HEX = { q: 2, r: 0 };
const SEA_HEX_2 = { q: 2, r: -1 };
const SHIP_EDGE = edgeAt(TEST_HEX.e, 0); // touches SEA_HEX

function seafaringState(overrides: Partial<GameState> = {}): GameState {
  const base = testGameState();
  return {
    ...base,
    board: { ...base.board, seaHexes: [SEA_HEX, SEA_HEX_2] },
    pirateHex: SEA_HEX_2,
    ...overrides,
  };
}

describe("eligibleShipStealTargets", () => {
  it("finds a player with a ship on one of the hex's edges", () => {
    const state = seafaringState({
      players: [
        testGameState().players[0]!,
        { ...testGameState().players[1]!, hand: { wood: 1, wheat: 0, sheep: 0, brick: 0, ore: 0 } },
      ],
      ships: new Map([[SHIP_EDGE.id, "p2"]]),
    });
    expect(eligibleShipStealTargets(state, SEA_HEX, "p1")).toEqual(["p2"]);
  });

  it("excludes the acting player's own ship", () => {
    const state = seafaringState({ ships: new Map([[SHIP_EDGE.id, "p1"]]) });
    expect(eligibleShipStealTargets(state, SEA_HEX, "p1")).toEqual([]);
  });

  it("excludes a ship owner with an empty hand", () => {
    const state = seafaringState({ ships: new Map([[SHIP_EDGE.id, "p2"]]) });
    expect(eligibleShipStealTargets(state, SEA_HEX, "p1")).toEqual([]);
  });
});

describe("validatePirateMovementCore", () => {
  it("rejects a non-sea hex", () => {
    const state = seafaringState();
    expect(validatePirateMovementCore(state, "p1", TEST_HEX.center, null)).toMatchObject({
      code: "NOT_A_SEA_HEX",
    });
  });

  it("rejects moving to the pirate's current hex", () => {
    const state = seafaringState({ pirateHex: SEA_HEX });
    expect(validatePirateMovementCore(state, "p1", SEA_HEX, null)).toMatchObject({
      code: "PIRATE_MUST_MOVE",
    });
  });

  it("requires a steal target when one is eligible", () => {
    const state = seafaringState({
      players: [
        testGameState().players[0]!,
        { ...testGameState().players[1]!, hand: { wood: 1, wheat: 0, sheep: 0, brick: 0, ore: 0 } },
      ],
      ships: new Map([[SHIP_EDGE.id, "p2"]]),
    });
    expect(validatePirateMovementCore(state, "p1", SEA_HEX, null)).toMatchObject({
      code: "MUST_STEAL",
    });
  });

  it("rejects an invalid steal target", () => {
    const state = seafaringState();
    expect(validatePirateMovementCore(state, "p1", SEA_HEX, "p2")).toMatchObject({
      code: "INVALID_STEAL_TARGET",
    });
  });

  it("allows a move with no steal when nobody is eligible", () => {
    const state = seafaringState();
    expect(validatePirateMovementCore(state, "p1", SEA_HEX, null)).toBeNull();
  });
});

describe("validateMovePirate", () => {
  it("requires the robber phase", () => {
    const state = seafaringState({ phase: { name: "main" } });
    expect(validateMovePirate(state, "p1", SEA_HEX, null)).toMatchObject({ code: "WRONG_PHASE" });
  });

  it("requires the current player", () => {
    const state = seafaringState({ phase: { name: "robber" }, currentPlayerIndex: 1 });
    expect(validateMovePirate(state, "p1", SEA_HEX, null)).toMatchObject({ code: "NOT_YOUR_TURN" });
  });

  it("passes through to the core check for a legal move", () => {
    const state = seafaringState({ phase: { name: "robber" }, currentPlayerIndex: 0 });
    expect(validateMovePirate(state, "p1", SEA_HEX, null)).toBeNull();
  });
});

describe("applyPirateMovementCore / movePirate", () => {
  it("moves the pirate and steals a random resource from the chosen player", () => {
    const state = seafaringState({
      players: [
        testGameState().players[0]!,
        {
          ...testGameState().players[1]!,
          id: "p2",
          hand: { wood: 2, wheat: 0, sheep: 0, brick: 0, ore: 0 },
        },
      ],
      ships: new Map([[SHIP_EDGE.id, "p2"]]),
    });
    const result = applyPirateMovementCore(state, "p1", SEA_HEX, "p2");
    expect(result.state.pirateHex).toEqual(SEA_HEX);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    const p2 = result.state.players.find((p) => p.id === "p2")!;
    expect(p1.hand.wood).toBe(1);
    expect(p2.hand.wood).toBe(1);
    expect(result.events.some((e) => e.type === "PIRATE_MOVED")).toBe(true);
    expect(result.events.some((e) => e.type === "RESOURCE_STOLEN")).toBe(true);
  });

  it("movePirate transitions phase back to main", () => {
    const state = seafaringState({ phase: { name: "robber" } });
    const result = movePirate(state, "p1", SEA_HEX, null);
    expect(result.state.phase).toEqual({ name: "main" });
  });
});
