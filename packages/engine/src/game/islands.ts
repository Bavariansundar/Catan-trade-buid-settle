import { hexKey, neighbors, type Hex } from "../coordinates.js";
import type { HexTile } from "../types.js";

/**
 * Connected components of land hexes (hex-adjacency, not vertex-adjacency —
 * two hexes are on the same island iff you can walk hex-to-hex-neighbor
 * across land the whole way). Seafarers-style only; used for the
 * exploration reveal and the island-settlement VP bonus.
 */
export function computeIslands(tiles: readonly HexTile[]): Hex[][] {
  const remaining = new Map<string, Hex>();
  for (const tile of tiles) remaining.set(hexKey(tile.hex), tile.hex);

  const islands: Hex[][] = [];
  for (const startKey of [...remaining.keys()]) {
    const start = remaining.get(startKey);
    if (!start) continue; // already claimed by an earlier island's BFS

    const island: Hex[] = [];
    const queue: Hex[] = [start];
    remaining.delete(startKey);
    while (queue.length > 0) {
      const hex = queue.pop()!;
      island.push(hex);
      for (const neighbor of neighbors(hex)) {
        const nKey = hexKey(neighbor);
        const nHex = remaining.get(nKey);
        if (nHex) {
          remaining.delete(nKey);
          queue.push(nHex);
        }
      }
    }
    islands.push(island);
  }
  return islands;
}

/** Stable id for an island: the lexicographically smallest hexKey among its hexes. */
export function islandId(island: readonly Hex[]): string {
  return island.map(hexKey).sort()[0]!;
}

/** The id of whichever island contains `hex`, or `null` if `hex` isn't land in `islands`. */
export function islandIdContaining(islands: readonly Hex[][], hex: Hex): string | null {
  const key = hexKey(hex);
  for (const island of islands) {
    if (island.some((h) => hexKey(h) === key)) return islandId(island);
  }
  return null;
}
