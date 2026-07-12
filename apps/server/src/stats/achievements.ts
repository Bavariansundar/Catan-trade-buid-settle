import type { PlayerId } from "@baychearsbar/engine";
import type { AchievementId } from "../domain/types.js";
import type { GameStats } from "./aggregateGameStats.js";

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly name: string;
  readonly description: string;
}

/** The full roster — fixed at 10, per PROMPTS.md Phase 10. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: "first_win", name: "First Win", description: "Win your first game." },
  { id: "ten_wins", name: "Ten Wins", description: "Win 10 games." },
  {
    id: "longest_road_master",
    name: "Longest Road Master",
    description: "Hold Longest Road at the end of a game.",
  },
  {
    id: "largest_army_commander",
    name: "Largest Army Commander",
    description: "Hold Largest Army at the end of a game.",
  },
  {
    id: "trade_baron",
    name: "Trade Baron",
    description: "Complete 10 or more trades in a single game.",
  },
  {
    id: "lucky_seven",
    name: "Lucky Seven",
    description: "Personally roll a natural 7 five times in a single game.",
  },
  { id: "settler", name: "Settler", description: "Build 4 or more settlements in a single game." },
  { id: "city_builder", name: "City Builder", description: "Build all 4 cities in a single game." },
  {
    id: "robber_baron",
    name: "Robber Baron",
    description: "Steal 5 or more resources in a single game.",
  },
  {
    id: "flawless_victory",
    name: "Flawless Victory",
    description: "Win a game without ever discarding a card.",
  },
];

/**
 * Which achievements `playerId` newly qualifies for based on this one game's
 * stats plus their updated career totals (`gamesWon` already includes this
 * game). Idempotent to call repeatedly — the caller (achievementRepository)
 * no-ops on an already-unlocked id, so re-evaluating past games is harmless.
 */
export function evaluateAchievements(
  stats: GameStats,
  playerId: PlayerId,
  gamesWonIncludingThisGame: number,
): AchievementId[] {
  const isWinner = stats.winnerId === playerId;
  const unlocked: AchievementId[] = [];

  if (isWinner && gamesWonIncludingThisGame >= 1) unlocked.push("first_win");
  if (isWinner && gamesWonIncludingThisGame >= 10) unlocked.push("ten_wins");
  if (stats.finalLongestRoadHolder === playerId) unlocked.push("longest_road_master");
  if (stats.finalLargestArmyHolder === playerId) unlocked.push("largest_army_commander");
  if ((stats.tradesPerPlayer[playerId] ?? 0) >= 10) unlocked.push("trade_baron");
  if ((stats.sevensRolledPerPlayer[playerId] ?? 0) >= 5) unlocked.push("lucky_seven");
  if ((stats.settlementsBuiltPerPlayer[playerId] ?? 0) >= 4) unlocked.push("settler");
  if ((stats.citiesBuiltPerPlayer[playerId] ?? 0) >= 4) unlocked.push("city_builder");
  if ((stats.resourcesStolenPerPlayer[playerId] ?? 0) >= 5) unlocked.push("robber_baron");
  if (isWinner && (stats.discardsPerPlayer[playerId] ?? 0) === 0) unlocked.push("flawless_victory");

  return unlocked;
}
