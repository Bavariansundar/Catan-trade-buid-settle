import {
  edgesOfHex,
  verticesOfHex,
  type Edge,
  type GameState,
  type Vertex,
} from "@hexhaven/engine";

/**
 * Every distinct vertex/edge touching the board's known tiles — the
 * candidate space every bot's build-move generator filters down via the
 * engine's own `validate*` functions, so a bot can never propose an
 * illegal action (see docs note in legalActions.ts).
 */
export function allBoardVertices(state: GameState): Vertex[] {
  const byId = new Map<string, Vertex>();
  for (const tile of state.board.tiles) {
    for (const vertex of verticesOfHex(tile.hex)) byId.set(vertex.id, vertex);
  }
  return [...byId.values()];
}

export function allBoardEdges(state: GameState): Edge[] {
  const byId = new Map<string, Edge>();
  for (const tile of state.board.tiles) {
    for (const edge of edgesOfHex(tile.hex)) byId.set(edge.id, edge);
  }
  return [...byId.values()];
}
