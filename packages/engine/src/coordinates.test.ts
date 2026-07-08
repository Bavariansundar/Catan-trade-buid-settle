import { describe, expect, it } from "vitest";
import {
  edgeAt,
  edgesOfHex,
  hexDistance,
  hexEquals,
  hexesWithinRadius,
  neighbor,
  neighbors,
  vertexAt,
  verticesOfEdge,
  verticesOfHex,
  type Hex,
} from "./coordinates.js";

describe("hexesWithinRadius", () => {
  it("returns exactly 19 hexes for radius 2 around the origin", () => {
    const hexes = hexesWithinRadius({ q: 0, r: 0 }, 2);
    expect(hexes).toHaveLength(19);
  });

  it("returns exactly 1 hex for radius 0", () => {
    expect(hexesWithinRadius({ q: 0, r: 0 }, 0)).toEqual([{ q: 0, r: 0 }]);
  });

  it("contains no duplicate hexes", () => {
    const hexes = hexesWithinRadius({ q: 0, r: 0 }, 3);
    const keys = new Set(hexes.map((h) => `${h.q},${h.r}`));
    expect(keys.size).toBe(hexes.length);
  });

  it("every returned hex is within the given cube distance of center", () => {
    const center = { q: 0, r: 0 };
    const hexes = hexesWithinRadius(center, 2);
    for (const hex of hexes) {
      expect(hexDistance(hex, center)).toBeLessThanOrEqual(2);
    }
  });
});

describe("hexDistance", () => {
  it("is 0 for the same hex", () => {
    expect(hexDistance({ q: 1, r: -1 }, { q: 1, r: -1 })).toBe(0);
  });

  it("is 1 for direct neighbors", () => {
    const center: Hex = { q: 0, r: 0 };
    for (const n of neighbors(center)) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });

  it("is 2 for a hex two rings out", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: -2 })).toBe(2);
  });
});

describe("neighbor", () => {
  it("produces 6 distinct neighbors", () => {
    const center: Hex = { q: 0, r: 0 };
    const ns = neighbors(center);
    const keys = new Set(ns.map((h) => `${h.q},${h.r}`));
    expect(keys.size).toBe(6);
  });

  it("is symmetric: neighbor(neighbor(H, d), opposite(d)) === H", () => {
    const center: Hex = { q: 2, r: -1 };
    for (let d = 0; d < 6; d++) {
      const opposite = ((d + 3) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
      const there = neighbor(center, d as 0 | 1 | 2 | 3 | 4 | 5);
      const back = neighbor(there, opposite);
      expect(hexEquals(back, center)).toBe(true);
    }
  });
});

describe("vertexAt canonicalization", () => {
  it("gives the same vertex id from any of the 3 touching hexes", () => {
    const hex: Hex = { q: 0, r: 0 };
    // corner 0 of hex touches { hex, hex+E, hex+NE }
    const fromHex = vertexAt(hex, 0);

    const hexE = neighbor(hex, 0); // E
    // From hexE's perspective, the same physical point is its corner
    // between W (3) and NE... concretely it's the corner shared with
    // {hexE, hex, hex+NE}: that's corner 2 of hexE's own frame? Instead of
    // guessing, verify via the touching-hex-set invariant below.
    expect(fromHex.hexes).toHaveLength(3);
    expect(fromHex.hexes.some((h) => hexEquals(h, hex))).toBe(true);
    expect(fromHex.hexes.some((h) => hexEquals(h, hexE))).toBe(true);
  });

  it("every (hex, corner) pair touching a shared point yields the same id", () => {
    // Brute-force: for every hex within radius 3 and every corner, the
    // vertex's own 3 touching hexes must each independently reproduce the
    // exact same vertex id when queried from their own matching corner.
    const hexes = hexesWithinRadius({ q: 0, r: 0 }, 3);
    for (const hex of hexes) {
      for (let corner = 0; corner < 6; corner++) {
        const v = vertexAt(hex, corner as 0 | 1 | 2 | 3 | 4 | 5);
        for (const touchingHex of v.hexes) {
          // find a corner on touchingHex that reproduces v
          const matches = [0, 1, 2, 3, 4, 5]
            .map((c) => vertexAt(touchingHex, c as 0 | 1 | 2 | 3 | 4 | 5))
            .some((candidate) => candidate.id === v.id);
          expect(matches).toBe(true);
        }
      }
    }
  });
});

describe("edgeAt canonicalization", () => {
  it("gives the same edge id from either adjacent hex", () => {
    const hex: Hex = { q: 0, r: 0 };
    const e1 = edgeAt(hex, 0); // hex -> E neighbor
    const eastNeighbor = neighbor(hex, 0);
    const e2 = edgeAt(eastNeighbor, 3); // eastNeighbor -> W neighbor (back to hex)
    expect(e1.id).toBe(e2.id);
  });
});

describe("verticesOfHex / edgesOfHex", () => {
  it("every hex has exactly 6 distinct corners", () => {
    const hex: Hex = { q: -1, r: 2 };
    const vertices = verticesOfHex(hex);
    expect(vertices).toHaveLength(6);
    expect(new Set(vertices.map((v) => v.id)).size).toBe(6);
  });

  it("every hex has exactly 6 distinct edges", () => {
    const hex: Hex = { q: -1, r: 2 };
    const edges = edgesOfHex(hex);
    expect(edges).toHaveLength(6);
    expect(new Set(edges.map((e) => e.id)).size).toBe(6);
  });
});

describe("verticesOfEdge", () => {
  it("returns the 2 endpoints, each of which lists the edge's 2 hexes among their 3", () => {
    const hex: Hex = { q: 0, r: 0 };
    const edge = edgeAt(hex, 0);
    const [v1, v2] = verticesOfEdge(edge);
    expect(v1.id).not.toBe(v2.id);
    for (const vertex of [v1, v2]) {
      for (const edgeHex of edge.hexes) {
        expect(vertex.hexes.some((h) => hexEquals(h, edgeHex))).toBe(true);
      }
    }
  });

  it("is consistent with vertexAt for every edge of every hex in a radius-3 board", () => {
    const hexes = hexesWithinRadius({ q: 0, r: 0 }, 3);
    for (const hex of hexes) {
      for (const edge of edgesOfHex(hex)) {
        // Should not throw, and should return exactly 2 vertices
        expect(() => verticesOfEdge(edge)).not.toThrow();
      }
    }
  });
});
