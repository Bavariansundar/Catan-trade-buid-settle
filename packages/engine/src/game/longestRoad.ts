import { verticesOfEdge, type Edge } from "../coordinates.js";
import type { PlayerId } from "../types.js";
import type { GameState } from "./types.js";

const MINIMUM_LONGEST_ROAD = 5;

/**
 * Longest road length for `playerId`: the longest *trail* (edges distinct,
 * vertices may repeat) through their own road edges. Vertices may repeat
 * because a closed loop of roads counts its full length in Catan — the
 * trail can pass back through an intersection it already visited. The one
 * exception is an opponent's settlement/city: the trail cannot pass
 * *through* such a vertex (arrive via one edge, leave via another) — it may
 * only be a dead end (the trail can still start or end there).
 *
 * Implemented as an exhaustive DFS over edge-simple walks. Player road
 * networks are small (<=15 edges, degree <=3 per vertex on this grid), so
 * this is cheap despite being combinatorial in the worst case.
 */
export function computeLongestRoad(state: GameState, playerId: PlayerId): number {
  const playerEdges = [...state.roads.entries()]
    .filter(([, owner]) => owner === playerId)
    .map(([edgeId]) => edgeId);
  if (playerEdges.length === 0) return 0;

  // GameState.roads is keyed by Edge.id but doesn't store the Edge object
  // itself, so reconstruct each edge (and thus its 2 endpoint vertices) from
  // its canonical "q,r|q,r" id.
  const edgesByVertex = new Map<string, { edge: Edge; otherVertexId: string }[]>();
  for (const edgeId of playerEdges) {
    const edge = edgeFromId(edgeId);
    const [v1, v2] = verticesOfEdge(edge);
    pushAdjacency(edgesByVertex, v1.id, edge, v2.id);
    pushAdjacency(edgesByVertex, v2.id, edge, v1.id);
  }

  const isBlocked = (vertexId: string): boolean => {
    const building = state.buildings.get(vertexId);
    return building !== undefined && building.playerId !== playerId;
  };

  function explore(vertexId: string, visitedEdgeIds: Set<string>, isStart: boolean): number {
    if (isBlocked(vertexId) && !isStart) return 0;
    let best = 0;
    for (const { edge, otherVertexId } of edgesByVertex.get(vertexId) ?? []) {
      if (visitedEdgeIds.has(edge.id)) continue;
      visitedEdgeIds.add(edge.id);
      const extended = 1 + explore(otherVertexId, visitedEdgeIds, false);
      visitedEdgeIds.delete(edge.id);
      if (extended > best) best = extended;
    }
    return best;
  }

  let overallBest = 0;
  for (const vertexId of edgesByVertex.keys()) {
    const length = explore(vertexId, new Set(), true);
    if (length > overallBest) overallBest = length;
  }
  return overallBest;
}

function pushAdjacency(
  map: Map<string, { edge: Edge; otherVertexId: string }[]>,
  vertexId: string,
  edge: Edge,
  otherVertexId: string,
): void {
  const list = map.get(vertexId);
  const entry = { edge, otherVertexId };
  if (list) list.push(entry);
  else map.set(vertexId, [entry]);
}

/** Reconstructs an Edge from its canonical id ("q,r|q,r"). */
function edgeFromId(id: string): Edge {
  const [a, b] = id.split("|").map((hexPart) => {
    const [q, r] = hexPart.split(",").map(Number);
    return { q: q!, r: r! };
  }) as [{ q: number; r: number }, { q: number; r: number }];
  return { id, hexes: [a, b] };
}

/**
 * Recomputes who holds the Longest Road award. The current holder keeps it
 * unless a *single* other player now strictly exceeds their length; if the
 * holder's own length drops below the 5-road minimum, the award lapses
 * (goes to a unique qualifying player if one exists, else becomes vacant).
 * Ties never transfer or claim a vacant award.
 */
export function recomputeLongestRoad(state: GameState): PlayerId | null {
  const lengths = state.players.map((p) => ({
    id: p.id,
    length: computeLongestRoad(state, p.id),
  }));
  const holder = state.longestRoadPlayerId;
  const holderEntry = lengths.find((l) => l.id === holder);

  if (holder && holderEntry && holderEntry.length >= MINIMUM_LONGEST_ROAD) {
    const better = lengths.filter((l) => l.id !== holder && l.length > holderEntry.length);
    if (better.length === 0) return holder;
    const maxLength = Math.max(...better.map((l) => l.length));
    const topChallengers = better.filter((l) => l.length === maxLength);
    return topChallengers.length === 1 ? topChallengers[0]!.id : holder;
  }

  const qualifying = lengths.filter((l) => l.length >= MINIMUM_LONGEST_ROAD);
  if (qualifying.length === 0) return null;
  const maxLength = Math.max(...qualifying.map((l) => l.length));
  const top = qualifying.filter((l) => l.length === maxLength);
  return top.length === 1 ? top[0]!.id : null;
}
