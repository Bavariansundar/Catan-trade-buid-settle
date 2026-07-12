import { type Edge, type Hex, type Vertex, verticesOfEdge } from "@baychearsbar/engine";

/** Pixel projection for pointy-top axial hexes — matches docs/coordinates.md §1 exactly. */
export const HEX_SIZE = 52;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function hexToPixel(hex: Hex, size = HEX_SIZE): Point {
  return {
    x: size * Math.sqrt(3) * (hex.q + hex.r / 2),
    y: size * 1.5 * hex.r,
  };
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * A vertex's pixel position is the centroid of its 3 touching hexes' pixel
 * centers — exact for a regular hex grid, since 3 mutually-adjacent hex
 * centers form an equilateral triangle around their shared corner.
 */
export function vertexToPixel(vertex: Vertex, size = HEX_SIZE): Point {
  return centroid(vertex.hexes.map((h) => hexToPixel(h, size)));
}

export function edgeMidpoint(edge: Edge, size = HEX_SIZE): Point {
  return centroid(edge.hexes.map((h) => hexToPixel(h, size)));
}

export function edgeEndpoints(edge: Edge, size = HEX_SIZE): [Point, Point] {
  const [a, b] = verticesOfEdge(edge);
  return [vertexToPixel(a, size), vertexToPixel(b, size)];
}

/**
 * The 6 corner points of a hex. `hexToPixel` spaces centers assuming
 * pointy-top hexes (flat vertical edges on the E/W sides, so the pure-q
 * neighbor offset — a horizontal shift — lands on a shared edge). A
 * pointy-top hex's corners must therefore straddle the cardinal angles in
 * ±30° pairs (e.g. -30°/30° for the E edge), not ±0°/60° — verified against
 * `vertexToPixel`'s independent centroid-of-3-hex-centers computation, which
 * every vertex/road/settlement position in this app is actually derived
 * from; corner 0 here is chosen so these two methods agree exactly.
 */
export function hexCorners(hex: Hex, size = HEX_SIZE): Point[] {
  const center = hexToPixel(hex, size);
  return Array.from({ length: 6 }, (_, i) => {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    return { x: center.x + size * Math.cos(angleRad), y: center.y + size * Math.sin(angleRad) };
  });
}

export function hexPolygonPoints(hex: Hex, size = HEX_SIZE): string {
  return hexCorners(hex, size)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
}
