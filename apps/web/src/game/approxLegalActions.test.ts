import { describe, expect, it } from "vitest";
import {
  applyAction,
  BASE_MODULE,
  createGame,
  edgesOfVertex,
  isEdgeOnBoard,
  isRuleError,
  satisfiesDistanceRule,
  verticesOfHex,
  viewFor,
  type Action,
  type ApplySuccess,
  type GameState,
  type Vertex,
} from "@hexhaven/engine";
import { approxLegalActions } from "./approxLegalActions.js";

function apply(state: GameState, action: Action): ApplySuccess {
  const result = applyAction([BASE_MODULE], state, action);
  if (isRuleError(result)) {
    throw new Error(`Action ${action.type} rejected: ${result.code} — ${result.message}`);
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

describe("approxLegalActions — setup phase road highlighting", () => {
  it("only highlights edges touching the settlement just placed, not the player's earlier settlement", () => {
    // 2-player snake draft order is [a, b, b, a]: player "a"'s second settlement
    // (step 3) happens while they already have a first settlement + road (step 0)
    // elsewhere on the board — exactly the scenario setup.ts's NOT_CONNECTED
    // check guards against.
    let state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "approx-legal-test" });

    const firstVertexA = findLegalSetupVertex(state);
    state = apply(state, { type: "PLACE_SETTLEMENT", playerId: "a", vertex: firstVertexA }).state;
    const firstRoadA = edgesOfVertex(firstVertexA).find(
      (e) => isEdgeOnBoard(state, e) && !state.roads.has(e.id),
    )!;
    state = apply(state, { type: "PLACE_ROAD", playerId: "a", edge: firstRoadA }).state;

    const firstVertexB = findLegalSetupVertex(state);
    state = apply(state, { type: "PLACE_SETTLEMENT", playerId: "b", vertex: firstVertexB }).state;
    const firstRoadB = edgesOfVertex(firstVertexB).find(
      (e) => isEdgeOnBoard(state, e) && !state.roads.has(e.id),
    )!;
    state = apply(state, { type: "PLACE_ROAD", playerId: "b", edge: firstRoadB }).state;

    const secondVertexB = findLegalSetupVertex(state);
    state = apply(state, { type: "PLACE_SETTLEMENT", playerId: "b", vertex: secondVertexB }).state;
    const secondRoadB = edgesOfVertex(secondVertexB).find(
      (e) => isEdgeOnBoard(state, e) && !state.roads.has(e.id),
    )!;
    state = apply(state, { type: "PLACE_ROAD", playerId: "b", edge: secondRoadB }).state;

    // Now it's "a"'s second settlement (step 3) — place it far from the first.
    const secondVertexA = findLegalSetupVertex(state);
    state = apply(state, {
      type: "PLACE_SETTLEMENT",
      playerId: "a",
      vertex: secondVertexA,
    }).state;

    expect(state.phase.name).toBe("setup");
    if (state.phase.name !== "setup") throw new Error("expected setup phase");
    expect(state.phase.awaitingRoad).toBe(true);
    expect(state.phase.lastSettlementVertex?.id).toBe(secondVertexA.id);

    const view = viewFor([BASE_MODULE], state, "a");
    const legal = approxLegalActions(view, "a");

    const legalEdgesTouchFirstSettlement = legal.roadEdgeIds.some((edgeId) =>
      edgesOfVertex(firstVertexA).some((e) => e.id === edgeId),
    );
    const legalEdgesTouchSecondSettlement = legal.roadEdgeIds.every((edgeId) =>
      edgesOfVertex(secondVertexA).some((e) => e.id === edgeId),
    );

    expect(legalEdgesTouchFirstSettlement).toBe(false);
    expect(legalEdgesTouchSecondSettlement).toBe(true);
    expect(legal.roadEdgeIds.length).toBeGreaterThan(0);
  });
});
