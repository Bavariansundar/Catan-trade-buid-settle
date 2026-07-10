import { apiRequest } from "./client.js";

export interface PlayerStatsRecord {
  readonly userId: string;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  readonly ratingByPlayerCount: Readonly<Record<string, number>>;
}

export type AchievementId =
  | "first_win"
  | "ten_wins"
  | "longest_road_master"
  | "largest_army_commander"
  | "trade_baron"
  | "lucky_seven"
  | "settler"
  | "city_builder"
  | "robber_baron"
  | "flawless_victory";

export interface AchievementRecord {
  readonly userId: string;
  readonly achievementId: AchievementId;
  readonly gameId: string | null;
  readonly unlockedAt: string;
}

export interface ProfileSummary {
  readonly stats: PlayerStatsRecord;
  readonly achievements: readonly AchievementRecord[];
}

export function getProfile(accessToken: string): Promise<ProfileSummary> {
  return apiRequest<ProfileSummary>("/profile", { accessToken });
}

/** Mirrors apps/server's stats/achievements.ts roster — kept in sync by hand (small, fixed list). */
export const ACHIEVEMENT_INFO: Record<AchievementId, { name: string; description: string }> = {
  first_win: { name: "First Win", description: "Win your first game." },
  ten_wins: { name: "Ten Wins", description: "Win 10 games." },
  longest_road_master: {
    name: "Longest Road Master",
    description: "Hold Longest Road at the end of a game.",
  },
  largest_army_commander: {
    name: "Largest Army Commander",
    description: "Hold Largest Army at the end of a game.",
  },
  trade_baron: { name: "Trade Baron", description: "Complete 10 or more trades in a single game." },
  lucky_seven: {
    name: "Lucky Seven",
    description: "Personally roll a natural 7 five times in a single game.",
  },
  settler: { name: "Settler", description: "Build 4 or more settlements in a single game." },
  city_builder: { name: "City Builder", description: "Build all 4 cities in a single game." },
  robber_baron: {
    name: "Robber Baron",
    description: "Steal 5 or more resources in a single game.",
  },
  flawless_victory: {
    name: "Flawless Victory",
    description: "Win a game without ever discarding a card.",
  },
};
