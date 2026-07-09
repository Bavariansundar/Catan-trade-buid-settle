import { verticesOfEdge, type Edge } from "../coordinates.js";
import type { PlayerId } from "../types.js";
import type { GameState } from "./types.js";

const MINIMUM_LONGEST_ROAD = 5;

type EdgeKind = "road" | "ship";

interface AdjacencyEntry {
  readonly edge: Edge;
  readonly otherVertexId: string;
  readonly kind: EdgeKind;
}

/**
 * Longest road/route length for `playerId`: the longest *trail* (edges
 * distinct, vertices may repeat) through their own road AND ship edges
 * combined. Vertices may repeat because a closed loop counts its full
 * length in Catan — the trail can pass back through an intersection it
 * already visited. An opponent's settlement/city blocks the trail from
 * passing *through* a vertex (arrive via one edge, leave via another) — it
 * may only be a dead end (the trail can still start or end there).
 *
 * Once ships exist (seafarers-style), there's one more rule: switching
 * between a road-kind edge and a ship-kind edge is only allowed at a
 * vertex holding the *player's own* settlement or city — see
 * docs/rules/seafarers-style.md §6. Two edges of the *same* kind still
 * chain through any open or own-occupied vertex exactly as before. For
 * base/five-six-players games `state.ships` is empty, so every edge is
 * road-kind and this rule never engages — zero behavior change.
 *
 * Implemented as an exhaustive DFS over edge-simple walks. Player networks
 * are small (<=15 roads + <=15 ships, degree <=3 per vertex on this grid),
 * so this is cheap despite being combinatorial in the worst case.
 */
export function computeLongestRoad(state: GameState, playerId: PlayerId): number {
  const ownedEdges: { edgeId: string; kind: EdgeKind }[] = [];
  for (const [edgeId, owner] of state.roads) {
    if (owner === playerId) ownedEdges.push({ edgeId, kind: "road" });
  }
  for (const [edgeId, owner] of state.ships) {
    if (owner === playerId) ownedEdges.push({ edgeId, kind: "ship" });
  }
  if (ownedEdges.length === 0) return 0;

  // GameState.roads/ships are keyed by Edge.id but don't store the Edge
  // object itself, so reconstruct each edge (and thus its 2 endpoint
  // vertices) from its canonical "q,r|q,r" id.
  const edgesByVertex = new Map<string, AdjacencyEntry[]>();
  for (const { edgeId, kind } of ownedEdges) {
    const edge = edgeFromId(edgeId);
    const [v1, v2] = verticesOfEdge(edge);
    pushAdjacency(edgesByVertex, v1.id, edge, v2.id, kind);
    pushAdjacency(edgesByVertex, v2.id, edge, v1.id, kind);
  }

  const buildingOwner = (vertexId: string): PlayerId | undefined =>
    state.buildings.get(vertexId)?.playerId;

  function explore(
    vertexId: string,
    visitedEdgeIds: Set<string>,
    isStart: boolean,
    cameFromKind: EdgeKind | null,
  ): number {
    const owner = buildingOwner(vertexId);
    if (owner !== undefined && owner !== playerId && !isStart) return 0; // opponent blocks pass-through
    const ownBuilding = owner === playerId;

    let best = 0;
    for (const { edge, otherVertexId, kind } of edgesByVertex.get(vertexId) ?? []) {
      if (visitedEdgeIds.has(edge.id)) continue;
      if (!isStart && kind !== cameFromKind && !ownBuilding) continue; // road<->ship needs own building
      visitedEdgeIds.add(edge.id);
      const extended = 1 + explore(otherVertexId, visitedEdgeIds, false, kind);
      visitedEdgeIds.delete(edge.id);
      if (extended > best) best = extended;
    }
    return best;
  }

  let overallBest = 0;
  for (const vertexId of edgesByVertex.keys()) {
    const length = explore(vertexId, new Set(), true, null);
    if (length > overallBest) overallBest = length;
  }
  return overallBest;
}

function pushAdjacency(
  map: Map<string, AdjacencyEntry[]>,
  vertexId: string,
  edge: Edge,
  otherVertexId: string,
  kind: EdgeKind,
): void {
  const entry: AdjacencyEntry = { edge, otherVertexId, kind };
  const list = map.get(vertexId);
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
 * Recomputes who holds the Longest Road/Route award. The current holder
 * keeps it unless a *single* other player now strictly exceeds their
 * length; if the holder's own length drops below the 5-edge minimum, the
 * award lapses (goes to a unique qualifying player if one exists, else
 * becomes vacant). Ties never transfer or claim a vacant award.
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
