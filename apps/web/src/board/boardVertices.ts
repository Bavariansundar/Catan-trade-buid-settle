import { edgesOfHex, verticesOfHex, type Board, type Edge, type Vertex } from "@hexhaven/engine";

/**
 * Every distinct vertex/edge touching the board's tiles, derived purely from
 * public tile geometry — safe to compute from a redacted `GameView` (no full
 * `GameState` needed), unlike `packages/bots`' `allBoardVertices`/
 * `allBoardEdges` which take a full state for legal-move filtering.
 */
export function allVerticesOnBoard(board: Board): Vertex[] {
  const byId = new Map<string, Vertex>();
  for (const tile of board.tiles) {
    for (const vertex of verticesOfHex(tile.hex)) byId.set(vertex.id, vertex);
  }
  return [...byId.values()];
}

export function allEdgesOnBoard(board: Board): Edge[] {
  const byId = new Map<string, Edge>();
  for (const tile of board.tiles) {
    for (const edge of edgesOfHex(tile.hex)) byId.set(edge.id, edge);
  }
  return [...byId.values()];
}
