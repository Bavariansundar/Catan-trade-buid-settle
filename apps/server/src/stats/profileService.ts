import type { AchievementRecord, PlayerStatsRecord } from "../domain/types.js";
import type { AchievementRepository } from "./achievementRepository.js";
import type { PlayerStatsRepository } from "./playerStatsRepository.js";

export interface ProfileSummary {
  readonly stats: PlayerStatsRecord;
  readonly achievements: readonly AchievementRecord[];
}

function emptyStats(userId: string): PlayerStatsRecord {
  return { userId, gamesPlayed: 0, gamesWon: 0, ratingByPlayerCount: {} };
}

export class ProfileService {
  constructor(
    private readonly playerStats: PlayerStatsRepository,
    private readonly achievements: AchievementRepository,
  ) {}

  async getProfile(userId: string): Promise<ProfileSummary> {
    const stats = (await this.playerStats.get(userId)) ?? emptyStats(userId);
    const achievements = await this.achievements.listForUser(userId);
    return { stats, achievements };
  }
}
