/**
 * Hex/vertex/edge addressing scheme. See docs/coordinates.md for the design
 * rationale — this file is the single source of truth it describes.
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** Index into {@link AXIAL_DIRECTIONS}: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE. */
export type HexEdgeDirection = 0 | 1 | 2 | 3 | 4 | 5;

/** Index into the corner table in docs/coordinates.md §3. */
export type HexCornerDirection = 0 | 1 | 2 | 3 | 4 | 5;

export interface Vertex {
  readonly id: string;
  readonly hexes: readonly [Hex, Hex, Hex];
}

export interface Edge {
  readonly id: string;
  readonly hexes: readonly [Hex, Hex];
}

/** Axial deltas for directions 0–5, ordered by increasing angle (E=0°). */
export const AXIAL_DIRECTIONS: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
  { q: 1, r: 0 }, // 0: E
  { q: 1, r: -1 }, // 1: NE
  { q: 0, r: -1 }, // 2: NW
  { q: -1, r: 0 }, // 3: W
  { q: -1, r: 1 }, // 4: SW
  { q: 0, r: 1 }, // 5: SE
];

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexKey(hex: Hex): string {
  return `${hex.q},${hex.r}`;
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbor(hex: Hex, direction: HexEdgeDirection): Hex {
  const delta = AXIAL_DIRECTIONS[direction];
  return hexAdd(hex, delta);
}

export function neighbors(hex: Hex): Hex[] {
  return AXIAL_DIRECTIONS.map((_, i) => neighbor(hex, i as HexEdgeDirection));
}

/** Cube-coordinate distance between two hexes. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** All hexes within `radius` (inclusive) of `center`, ascending (q, r) order. */
export function hexesWithinRadius(center: Hex, radius: number): Hex[] {
  const result: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      result.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return sortHexes(result);
}

export function sortHexes(hexes: readonly Hex[]): Hex[] {
  return [...hexes].sort((a, b) => a.q - b.q || a.r - b.r);
}

/**
 * `vertexAt`/`edgeBetween` are on the hottest path in the engine (called by
 * every legal-move enumeration and every build validation — see
 * docs/technical-debt.md's load-test findings) and were previously going
 * through the generic `sortHexes` (an `Array.prototype.sort` call, with its
 * per-call overhead, for arrays of 2–3 elements) plus a `.map().join()` to
 * build the id. These two hand-written fast paths produce byte-identical
 * ids and hex ordering — just without allocating an intermediate array or
 * invoking the general sort machinery for what's always exactly 2 or 3
 * elements.
 */
function sortHexPair(a: Hex, b: Hex): [Hex, Hex] {
  return a.q < b.q || (a.q === b.q && a.r <= b.r) ? [a, b] : [b, a];
}

function sortHexTriple(a: Hex, b: Hex, c: Hex): [Hex, Hex, Hex] {
  let x = a;
  let y = b;
  let z = c;
  if (x.q > y.q || (x.q === y.q && x.r > y.r)) [x, y] = [y, x];
  if (y.q > z.q || (y.q === z.q && y.r > z.r)) [y, z] = [z, y];
  if (x.q > y.q || (x.q === y.q && x.r > y.r)) [x, y] = [y, x];
  return [x, y, z];
}

/**
 * The vertex at corner `corner` of `hex` — see docs/coordinates.md §3.
 * Canonicalized: any of the (up to 3) equivalent `(hex, corner)` pairs for
 * the same physical point produce an id-equal Vertex.
 */
export function vertexAt(hex: Hex, corner: HexCornerDirection): Vertex {
  const nextDir = ((corner + 1) % 6) as HexEdgeDirection;
  const [a, b, c] = sortHexTriple(hex, neighbor(hex, corner), neighbor(hex, nextDir));
  return { id: `${hexKey(a)}|${hexKey(b)}|${hexKey(c)}`, hexes: [a, b, c] };
}

/** The edge in direction `direction` from `hex` — see docs/coordinates.md §4. */
export function edgeAt(hex: Hex, direction: HexEdgeDirection): Edge {
  return edgeBetween(hex, neighbor(hex, direction));
}

/** The canonical edge shared by two known-adjacent hexes. */
export function edgeBetween(a: Hex, b: Hex): Edge {
  const [first, second] = sortHexPair(a, b);
  return { id: `${hexKey(first)}|${hexKey(second)}`, hexes: [first, second] };
}

/** All 6 corners of a hex, as canonical Vertex values. */
export function verticesOfHex(hex: Hex): Vertex[] {
  return [0, 1, 2, 3, 4, 5].map((corner) => vertexAt(hex, corner as HexCornerDirection));
}

/** All 6 edges of a hex, as canonical Edge values. */
export function edgesOfHex(hex: Hex): Edge[] {
  return [0, 1, 2, 3, 4, 5].map((direction) => edgeAt(hex, direction as HexEdgeDirection));
}

/**
 * The 2 vertices at the endpoints of an edge. Derived by recovering the
 * (hex, direction) representation from the edge's canonical hex pair.
 */
export function verticesOfEdge(edge: Edge): [Vertex, Vertex] {
  const [a, b] = edge.hexes;
  const direction = AXIAL_DIRECTIONS.findIndex((delta) => hexEquals(hexAdd(a, delta), b)) as
    HexEdgeDirection | -1;
  if (direction === -1) {
    throw new Error(`Edge ${edge.id} does not connect two adjacent hexes`);
  }
  const prevDirection = ((direction + 5) % 6) as HexCornerDirection;
  return [vertexAt(a, prevDirection), vertexAt(a, direction)];
}

/**
 * The 3 edges meeting at a vertex. The 3 hexes touching a vertex are always
 * pairwise adjacent (they form a small triangle around that point), so the
 * edges are exactly the 3 pairs among `vertex.hexes`.
 */
export function edgesOfVertex(vertex: Vertex): [Edge, Edge, Edge] {
  const [a, b, c] = vertex.hexes;
  return [edgeBetween(a, b), edgeBetween(b, c), edgeBetween(a, c)];
}

/** The 3 vertices directly connected to `vertex` by a single edge. */
export function neighborVertices(vertex: Vertex): Vertex[] {
  const result: Vertex[] = [];
  for (const edge of edgesOfVertex(vertex)) {
    for (const endpoint of verticesOfEdge(edge)) {
      if (endpoint.id !== vertex.id) result.push(endpoint);
    }
  }
  return result;
}
