import type { PlayerId } from "../types.js";
import { hiddenVictoryPointCount } from "./devCards.js";
import type { GameState } from "./types.js";

export const LONGEST_ROAD_VP = 2;
export const LARGEST_ARMY_VP = 2;

/** VP visible to everyone: buildings + Longest Road + Largest Army (no hidden VP cards). */
export function computePublicVictoryPoints(state: GameState, playerId: PlayerId): number {
  let points = 0;
  for (const building of state.buildings.values()) {
    if (building.playerId !== playerId) continue;
    points += building.type === "city" ? 2 : 1;
  }
  if (state.longestRoadPlayerId === playerId) points += LONGEST_ROAD_VP;
  if (state.largestArmyPlayerId === playerId) points += LARGEST_ARMY_VP;
  return points;
}

/** Total VP for `playerId`, including their own hidden VP dev cards. */
export function computeVictoryPoints(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  return computePublicVictoryPoints(state, playerId) + hiddenVictoryPointCount(player);
}

/**
 * "Win only on your own turn": callers only invoke this for the player who
 * just took an action (building, buying/playing a dev card) — never for
 * side effects landing on someone else, e.g. Longest Road transferring to a
 * third party because the current player built a settlement.
 */
export function hasWon(state: GameState, playerId: PlayerId): boolean {
  return computeVictoryPoints(state, playerId) >= state.targetVictoryPoints;
}
