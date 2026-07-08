import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfHex, type Edge, type Vertex } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { isEdgeOnBoard, satisfiesDistanceRule } from "./building.js";
import { handTotal } from "./resources.js";
import { createGame } from "./setup.js";
import { isRuleError, type ApplySuccess, type GameState } from "./types.js";

function apply(state: GameState, action: Parameters<typeof applyAction>[1]): ApplySuccess {
  const result = applyAction(state, action);
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

describe("full game integration — setup through several rounds (4 players)", () => {
  it("plays a complete scripted game, asserting invariants after every action", () => {
    let state = createGame({ playerIds: ["a", "b", "c", "d"], seed: "integration-test" });

    // --- Setup phase: 8 steps (settlement + road each), snake draft order ---
    expect(state.phase.name).toBe("setup");
    for (let step = 0; step < 8; step++) {
      expect(state.phase.name).toBe("setup");
      if (state.phase.name !== "setup") break;
      const playerId = state.phase.order[state.phase.step]!;
      expect(playerId).toBe(state.players[state.currentPlayerIndex]!.id);

      const vertex = findLegalSetupVertex(state);
      const afterSettlement = apply(state, {
        type: "PLACE_SETTLEMENT",
        playerId,
        vertex,
      });
      expect(afterSettlement.state.buildings.get(vertex.id)).toEqual({
        playerId,
        type: "settlement",
      });
      state = afterSettlement.state;

      const edge = findLegalSetupRoad(state, vertex);
      const afterRoad = apply(state, { type: "PLACE_ROAD", playerId, edge });
      expect(afterRoad.state.roads.get(edge.id)).toBe(playerId);
      state = afterRoad.state;
    }

    // Setup complete: every player placed exactly 2 settlements + 2 roads.
    expect(state.phase).toEqual({ name: "roll" });
    expect(state.buildings.size).toBe(8);
    expect(state.roads.size).toBe(8);
    for (const player of state.players) {
      expect(player.pieces.settlements).toBe(3);
      expect(player.pieces.roads).toBe(13);
      expect(player.pieces.cities).toBe(4);
    }
    // First player in seating order acts first after setup.
    expect(state.players[state.currentPlayerIndex]!.id).toBe("a");

    // --- Several full turns ---
    for (let turn = 0; turn < 8; turn++) {
      expect(state.phase).toEqual({ name: "roll" });
      const playerId = state.players[state.currentPlayerIndex]!.id;

      const afterRoll = apply(state, { type: "ROLL_DICE", playerId });
      expect(afterRoll.state.diceRoll).not.toBeNull();
      state = afterRoll.state;

      // Resolve any pending discards (rolled a 7 with someone over 7 cards).
      while (state.phase.name === "discard") {
        const [discardingPlayerId, owed] = [...state.phase.pending.entries()][0]!;
        const discarder = state.players.find((p) => p.id === discardingPlayerId)!;
        const resources: Partial<Record<string, number>> = {};
        let remaining = owed;
        for (const resource of ["wood", "wheat", "sheep", "brick", "ore"] as const) {
          if (remaining <= 0) break;
          const take = Math.min(discarder.hand[resource], remaining);
          if (take > 0) {
            resources[resource] = take;
            remaining -= take;
          }
        }
        expect(remaining).toBe(0);
        const afterDiscard = apply(state, {
          type: "DISCARD",
          playerId: discardingPlayerId,
          resources,
        });
        state = afterDiscard.state;
      }

      // Resolve a mandatory robber move (rolled a 7).
      if (state.phase.name === "robber") {
        const currentHex = state.robber;
        const targetTile = state.board.tiles.find(
          (t) => t.hex.q !== currentHex.q || t.hex.r !== currentHex.r,
        )!;
        const eligible = new Set<string>();
        for (const vertex of verticesOfHex(targetTile.hex)) {
          const building = state.buildings.get(vertex.id);
          if (building && building.playerId !== playerId) {
            const victim = state.players.find((p) => p.id === building.playerId)!;
            if (handTotal(victim.hand) > 0) eligible.add(building.playerId);
          }
        }
        const stealFromPlayerId = eligible.size > 0 ? [...eligible][0]! : null;
        const afterRobber = apply(state, {
          type: "MOVE_ROBBER",
          playerId,
          hex: targetTile.hex,
          stealFromPlayerId,
        });
        expect(afterRobber.state.robber).toEqual(targetTile.hex);
        state = afterRobber.state;
      }

      expect(state.phase).toEqual({ name: "main" });

      // Exercise Phase 3 actions opportunistically, whenever affordable —
      // proves they're wired into a real multi-turn game, not just isolated
      // unit fixtures.
      const actor = state.players.find((p) => p.id === playerId)!;
      if (
        state.devDeck.length > 0 &&
        actor.hand.ore >= 1 &&
        actor.hand.wheat >= 1 &&
        actor.hand.sheep >= 1
      ) {
        const afterBuy = apply(state, { type: "BUY_DEV_CARD", playerId });
        expect(afterBuy.state.devDeck.length).toBe(state.devDeck.length - 1);
        state = afterBuy.state;
      }
      if (state.phase.name === "main") {
        const overstocked = (["wood", "wheat", "sheep", "brick", "ore"] as const).find(
          (r) => actor.hand[r] >= 4,
        );
        if (overstocked) {
          const target = (["wood", "wheat", "sheep", "brick", "ore"] as const).find(
            (r) => r !== overstocked,
          )!;
          const afterTrade = apply(state, {
            type: "MARITIME_TRADE",
            playerId,
            give: overstocked,
            get: target,
          });
          expect(afterTrade.state.players.find((p) => p.id === playerId)!.hand[overstocked]).toBe(
            actor.hand[overstocked] - 4,
          );
          state = afterTrade.state;
        }
      }
      if (state.phase.name !== "main") break; // a dev card purchase won the game outright

      const afterEndTurn = apply(state, { type: "END_TURN", playerId });
      expect(afterEndTurn.state.phase).toEqual({ name: "roll" });
      expect(afterEndTurn.state.diceRoll).toBeNull();
      const expectedNextIndex = (state.currentPlayerIndex + 1) % state.players.length;
      expect(afterEndTurn.state.currentPlayerIndex).toBe(expectedNextIndex);
      state = afterEndTurn.state;
    }

    // Sanity: bank never goes negative for any resource across the whole game.
    for (const amount of Object.values(state.bank)) {
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });
});
