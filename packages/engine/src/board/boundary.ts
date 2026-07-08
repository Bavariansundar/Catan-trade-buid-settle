import {
  edgeAt,
  hexKey,
  neighbor,
  type Edge,
  type Hex,
  type HexEdgeDirection,
} from "../coordinates.js";

/** Approximate 2D projection of a hex center (pointy-top; see docs/coordinates.md §1). */
function hexToPixel(hex: Hex): { x: number; y: number } {
  return { x: Math.sqrt(3) * (hex.q + hex.r / 2), y: 1.5 * hex.r };
}

/**
 * Edges of `hexes` whose other side is not part of the board, i.e. the
 * board's coastline/perimeter. Order is by increasing angle of the edge's
 * midpoint around the centroid of `hexes` — a stable, deterministic order
 * useful for placing harbors evenly around the coast.
 */
export function boundaryEdgesByAngle(hexes: readonly Hex[]): Edge[] {
  const inBoard = new Set(hexes.map(hexKey));
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const hex of hexes) {
    for (let dir = 0; dir < 6; dir++) {
      const outward = neighbor(hex, dir as HexEdgeDirection);
      if (inBoard.has(hexKey(outward))) continue;
      const edge = edgeAt(hex, dir as HexEdgeDirection);
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      edges.push(edge);
    }
  }

  const centroid = hexes.reduce(
    (acc, hex) => {
      const p = hexToPixel(hex);
      return { x: acc.x + p.x / hexes.length, y: acc.y + p.y / hexes.length };
    },
    { x: 0, y: 0 },
  );

  const angleOf = (edge: Edge): number => {
    const [a, b] = edge.hexes;
    const pa = hexToPixel(a);
    const pb = hexToPixel(b);
    const midpoint = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    return Math.atan2(midpoint.y - centroid.y, midpoint.x - centroid.x);
  };

  return [...edges].sort((a, b) => angleOf(a) - angleOf(b));
}
