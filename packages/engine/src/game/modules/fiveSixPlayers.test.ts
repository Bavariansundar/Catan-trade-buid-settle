import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfHex, type Edge, type Vertex } from "../../coordinates.js";
import { applyAction } from "../apply.js";
import { isEdgeOnBoard, satisfiesDistanceRule } from "../building.js";
import { createGame } from "../setup.js";
import { isRuleError, type Action, type ApplySuccess, type GameState } from "../types.js";
import { BASE_MODULE } from "./base.js";
import { FIVE_SIX_PLAYERS_MODULE } from "./fiveSixPlayers.js";

const MODULES = [BASE_MODULE, FIVE_SIX_PLAYERS_MODULE];

function apply(state: GameState, action: Action): ApplySuccess {
  const result = applyAction(MODULES, state, action);
  if (isRuleError(result)) {
    throw new Error(
      `Action ${action.type} by ${action.playerId} was rejected: ${result.code} — ${result.message}`,
    );
  }
  return result;
}

function allVertices(state: GameState): Vertex[] {
  const byId = new Map<string, Vertex>();
  for (const tile of state.board.tiles) {
    for (const vertex of verticesOfHex(tile.hex)) byId.set(vertex.id, vertex);
  }
  return [...byId.values()];
}

function findLegalSetupVertex(state: GameState): Vertex {
  const vertex = allVertices(state).find(
    (v) => !state.buildings.has(v.id) && satisfiesDistanceRule(state, v),
  );
  if (!vertex) throw new Error("No legal setup vertex found");
  return vertex;
}

function findLegalSetupRoad(state: GameState, vertex: Vertex): Edge {
  const edge = edgesOfVertex(vertex).find((e) => isEdgeOnBoard(state, e) && !state.roads.has(e.id));
  if (!edge) throw new Error("No legal setup road found");
  return edge;
}

const PLAYER_IDS = ["a", "b", "c", "d", "e"];

describe("five-six-players composition", () => {
  it("resolves a bigger board and config when composed with base", () => {
    const state = createGame(MODULES, { playerIds: PLAYER_IDS, seed: "five-six-test" });
    expect(state.board.tiles).toHaveLength(28);
    expect(state.board.harbors).toHaveLength(12);
    expect(state.bank).toEqual({ wood: 24, wheat: 24, sheep: 24, brick: 24, ore: 24 });
    expect(state.devDeck).toHaveLength(34);
  });

  it("still enforces the 2-4 range when only base is active (base-only unchanged)", () => {
    expect(() => createGame([BASE_MODULE], { playerIds: PLAYER_IDS, seed: "s" })).toThrow();
  });

  it("plays setup through the special build phase for 5 players", () => {
    let state = createGame(MODULES, { playerIds: PLAYER_IDS, seed: "five-six-integration" });

    // --- Setup: 5 players x (settlement + road) x 2 rounds = 20 steps ---
    for (let step = 0; step < PLAYER_IDS.length * 4; step++) {
      if (state.phase.name !== "setup") break;
      const playerId = state.phase.order[state.phase.step]!;
      const vertex = findLegalSetupVertex(state);
      state = apply(state, { type: "PLACE_SETTLEMENT", playerId, vertex }).state;
      const edge = findLegalSetupRoad(state, vertex);
      state = apply(state, { type: "PLACE_ROAD", playerId, edge }).state;
    }
    expect(state.phase).toEqual({ name: "roll" });
    expect(state.buildings.size).toBe(10);
    expect(state.roads.size).toBe(10);

    const firstRollerId = state.players[state.currentPlayerIndex]!.id;
    expect(firstRollerId).toBe("a");

    // Roll (skip past any 7/discard/robber complications by retrying with a
    // fresh seed isn't practical here — just resolve whatever comes up).
    const afterRoll = apply(state, { type: "ROLL_DICE", playerId: firstRollerId });
    state = afterRoll.state;
    while (state.phase.name === "discard") {
      const [discardingPlayerId] = [...state.phase.pending.entries()][0]!;
      state = apply(state, { type: "DISCARD", playerId: discardingPlayerId, resources: {} }).state;
    }
    if (state.phase.name === "robber") {
      state = apply(state, {
        type: "MOVE_ROBBER",
        playerId: firstRollerId,
        hex: state.board.tiles.find(
          (t) => t.hex.q !== state.robber.q || t.hex.r !== state.robber.r,
        )!.hex,
        stealFromPlayerId: null,
      }).state;
    }
    expect(state.phase).toEqual({ name: "main" });

    // Everyone else gets a special build chance before "b" rolls.
    const ended = apply(state, { type: "END_TURN", playerId: firstRollerId });
    state = ended.state;
    expect(ended.events.some((e) => e.type === "SPECIAL_BUILD_STARTED")).toBe(true);
    expect(state.phase.name).toBe("specialBuild");
    if (state.phase.name !== "specialBuild") throw new Error("unreachable");
    expect(state.phase.queue).toEqual(["b", "c", "d", "e"]);
    expect(state.phase.endedPlayerId).toBe("a");

    // "b" (queue[0]) can buy a dev card during special build if resourced...
    const resourced: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === "b" ? { ...p, hand: { ...p.hand, ore: 1, wheat: 1, sheep: 1 } } : p,
      ),
    };
    const bought = apply(resourced, { type: "BUY_DEV_CARD", playerId: "b" });
    expect(bought.state.devDeck).toHaveLength(state.devDeck.length - 1);
    // Buying doesn't advance the queue — "b" is still up.
    expect(bought.state.phase).toMatchObject({ name: "specialBuild", queue: ["b", "c", "d", "e"] });

    // ...but trading and playing dev cards are NOT allowed during special build.
    const tradeAttempt = applyAction(MODULES, resourced, {
      type: "PROPOSE_TRADE",
      playerId: "b",
      offering: { wood: 1 },
      requesting: { ore: 1 },
      targetPlayerIds: null,
    });
    expect(tradeAttempt).toMatchObject({ code: "WRONG_PHASE" });

    // Out-of-turn players in the queue can't act yet.
    const outOfTurn = applyAction(MODULES, state, { type: "PASS_SPECIAL_BUILD", playerId: "c" });
    expect(outOfTurn).toMatchObject({ code: "NOT_YOUR_TURN" });

    // Walk the whole queue via PASS_SPECIAL_BUILD.
    for (const playerId of ["b", "c", "d"]) {
      const result = apply(state, { type: "PASS_SPECIAL_BUILD", playerId });
      state = result.state;
      expect(state.phase.name).toBe("specialBuild");
    }
    const last = apply(state, { type: "PASS_SPECIAL_BUILD", playerId: "e" });
    state = last.state;
    expect(last.events.some((e) => e.type === "SPECIAL_BUILD_ENDED")).toBe(true);
    expect(state.phase).toEqual({ name: "roll" });
    expect(state.players[state.currentPlayerIndex]!.id).toBe("b");
  });
});
