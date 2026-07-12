import type { PlayerId } from "@baychearsbar/engine";

export const DEFAULT_RATING = 1200;
const K_FACTOR = 32;

function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * Multiplayer Elo update for one finished game: the winner is treated as
 * having individually beaten every other player (standard pairwise
 * extension of 1v1 Elo to N players — see e.g. multiplayer chess/Go rating
 * sites). Bot seats are excluded by the caller (only `PlayerStats` for real
 * users exists), so this only ever rates human participants against each
 * other and against the rating each human already has.
 */
export function updateRatings(
  currentRatings: Readonly<Record<PlayerId, number>>,
  playerIds: readonly PlayerId[],
  winnerId: PlayerId,
): Record<PlayerId, number> {
  const before: Record<PlayerId, number> = {};
  for (const id of playerIds) before[id] = currentRatings[id] ?? DEFAULT_RATING;

  const deltas: Record<PlayerId, number> = {};
  for (const id of playerIds) deltas[id] = 0;

  for (const id of playerIds) {
    if (id === winnerId) continue;
    const expectedWinner = expectedScore(before[winnerId]!, before[id]!);
    deltas[winnerId] = (deltas[winnerId] ?? 0) + K_FACTOR * (1 - expectedWinner);
    deltas[id] = (deltas[id] ?? 0) + K_FACTOR * (expectedWinner - 1);
  }

  const after: Record<PlayerId, number> = {};
  for (const id of playerIds) after[id] = Math.round(before[id]! + (deltas[id] ?? 0));
  return after;
}
