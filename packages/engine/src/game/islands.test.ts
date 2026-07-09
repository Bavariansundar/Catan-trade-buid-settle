import { describe, expect, it } from "vitest";
import { hexesWithinRadius, hexKey } from "../coordinates.js";
import { computeIslands, islandId, islandIdContaining } from "./islands.js";
import type { HexTile } from "../types.js";

function tilesFor(hexes: readonly { q: number; r: number }[]): HexTile[] {
  return hexes.map((hex) => ({ hex, terrain: "wood", number: 6 }));
}

describe("computeIslands", () => {
  it("returns a single island for one contiguous hex blob", () => {
    const hexes = hexesWithinRadius({ q: 0, r: 0 }, 1); // 7 hexes, all adjacent
    const islands = computeIslands(tilesFor(hexes));
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(7);
  });

  it("separates two islands with a gap between them", () => {
    const islandA = hexesWithinRadius({ q: 0, r: 0 }, 1); // 7 hexes
    const islandB = hexesWithinRadius({ q: 5, r: -2 }, 1); // 7 hexes, far away
    const islands = computeIslands(tilesFor([...islandA, ...islandB]));
    expect(islands).toHaveLength(2);
    const sizes = islands.map((i) => i.length).sort();
    expect(sizes).toEqual([7, 7]);
  });

  it("treats a single hex as its own island", () => {
    const islands = computeIslands(tilesFor([{ q: 0, r: 0 }]));
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(1);
  });

  it("returns no islands for an empty tile list", () => {
    expect(computeIslands([])).toEqual([]);
  });

  it("merges two hex blobs that touch into one island", () => {
    // Two triangles sharing exactly one hex-adjacency link.
    const a = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const b = [
      { q: 1, r: -1 },
      { q: 2, r: -1 },
    ];
    const islands = computeIslands(tilesFor([...a, ...b]));
    // {q:1,r:0} and {q:1,r:-1} are adjacent (NE direction), so this is one island.
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(4);
  });
});

describe("islandId / islandIdContaining", () => {
  it("is deterministic regardless of hex order within the island", () => {
    const hexes = [
      { q: 2, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const reversed = [...hexes].reverse();
    expect(islandId(hexes)).toBe(islandId(reversed));
  });

  it("finds the containing island for a hex, and null for a hex on no island", () => {
    const islandA = hexesWithinRadius({ q: 0, r: 0 }, 1);
    const islandB = hexesWithinRadius({ q: 5, r: -2 }, 1);
    const islands = computeIslands(tilesFor([...islandA, ...islandB]));

    const idForA = islandIdContaining(islands, islandA[0]!);
    const idForB = islandIdContaining(islands, islandB[0]!);
    expect(idForA).not.toBeNull();
    expect(idForB).not.toBeNull();
    expect(idForA).not.toBe(idForB);

    expect(islandIdContaining(islands, { q: 100, r: 100 })).toBeNull();
  });

  it("islandId matches the lexicographically smallest hexKey in the island", () => {
    const hexes = [
      { q: 2, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const expected = [...hexes.map(hexKey)].sort()[0];
    expect(islandId(hexes)).toBe(expected);
  });
});
