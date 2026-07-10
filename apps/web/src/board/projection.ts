import { type Edge, type Hex, type Vertex, verticesOfEdge } from "@hexhaven/engine";

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

/** The 6 corner points of a hex, in the same winding order as `AXIAL_DIRECTIONS`. */
export function hexCorners(hex: Hex, size = HEX_SIZE): Point[] {
  const center = hexToPixel(hex, size);
  // Pointy-top: corner i sits at angle (60*i - 90 + 30) = 60*i - 60 degrees from center,
  // offset so corner 0 (between E and NE neighbors) lands correctly.
  return Array.from({ length: 6 }, (_, i) => {
    const angleDeg = 60 * i - 60;
    const angleRad = (Math.PI / 180) * angleDeg;
    return { x: center.x + size * Math.cos(angleRad), y: center.y + size * Math.sin(angleRad) };
  });
}

export function hexPolygonPoints(hex: Hex, size = HEX_SIZE): string {
  return hexCorners(hex, size)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
}
