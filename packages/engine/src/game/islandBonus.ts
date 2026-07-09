import { hexEquals, hexKey, type Vertex } from "../coordinates.js";
import type { PlayerId } from "../types.js";
import { computeIslands, islandIdContaining } from "./islands.js";
import type { ApplySuccess, GameState } from "./types.js";

/**
 * Awards the one-time +1 VP island-settlement bonus if `vertex` is the
 * first settlement any player has built on a non-home island — see
 * docs/rules/seafarers-style.md §5. A no-op (returns `state` unchanged) if
 * the vertex isn't on land, is on a home island, or that island's bonus
 * was already claimed.
 */
export function checkIslandBonus(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): ApplySuccess {
  const homeKeys = new Set(state.homeIslandHexes.map(hexKey));
  const landHex = vertex.hexes.find((h) => state.board.tiles.some((t) => hexEquals(t.hex, h)));
  if (!landHex || homeKeys.has(hexKey(landHex))) {
    return { state, events: [] };
  }

  const islands = computeIslands(state.board.tiles);
  const targetIslandId = islandIdContaining(islands, landHex);
  if (!targetIslandId || state.islandBonusAwarded.has(targetIslandId)) {
    return { state, events: [] };
  }

  const islandBonusAwarded = new Map(state.islandBonusAwarded);
  islandBonusAwarded.set(targetIslandId, playerId);
  return {
    state: { ...state, islandBonusAwarded },
    events: [{ type: "ISLAND_BONUS_AWARDED", playerId, islandId: targetIslandId }],
  };
}
