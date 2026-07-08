import type { PlayerId } from "../types.js";
import type { GameState } from "./types.js";

const MINIMUM_LARGEST_ARMY = 3;

/**
 * Recomputes who holds Largest Army. Unlike Longest Road, knightsPlayed
 * never decreases, so this can only transfer, never lapse: the holder keeps
 * it unless a single other player now strictly exceeds their count.
 */
export function recomputeLargestArmy(state: GameState): PlayerId | null {
  const counts = state.players.map((p) => ({ id: p.id, knights: p.knightsPlayed }));
  const holder = state.largestArmyPlayerId;
  const holderEntry = counts.find((c) => c.id === holder);

  if (holder && holderEntry && holderEntry.knights >= MINIMUM_LARGEST_ARMY) {
    const better = counts.filter((c) => c.id !== holder && c.knights > holderEntry.knights);
    if (better.length === 0) return holder;
    const maxKnights = Math.max(...better.map((c) => c.knights));
    const topChallengers = better.filter((c) => c.knights === maxKnights);
    return topChallengers.length === 1 ? topChallengers[0]!.id : holder;
  }

  const qualifying = counts.filter((c) => c.knights >= MINIMUM_LARGEST_ARMY);
  if (qualifying.length === 0) return null;
  const maxKnights = Math.max(...qualifying.map((c) => c.knights));
  const top = qualifying.filter((c) => c.knights === maxKnights);
  return top.length === 1 ? top[0]!.id : null;
}
