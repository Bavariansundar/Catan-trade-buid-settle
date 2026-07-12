import type { PlayerId } from "@baychearsbar/engine";
import { resolveModules } from "../game/moduleResolver.js";
import type { GameRepository } from "../game/gameRepository.js";
import type { GameRecord } from "../domain/types.js";
import { aggregateGameStats } from "./aggregateGameStats.js";
import { evaluateAchievements } from "./achievements.js";
import type { AchievementRepository } from "./achievementRepository.js";
import { DEFAULT_RATING, updateRatings } from "./elo.js";
import type { PlayerStatsRepository } from "./playerStatsRepository.js";

/**
 * Updates career stats, Elo-style ratings, and achievements once a game
 * ends. Only ever touches human participants (`GameRepository.listParticipants`
 * excludes bot seats, since bots have no `User` row) — see
 * docs/architecture/server.md §0 for why this is its own injectable service
 * rather than logic inlined into `GameRuntimeService`.
 */
export class MatchRecorder {
  constructor(
    private readonly games: GameRepository,
    private readonly playerStats: PlayerStatsRepository,
    private readonly achievements: AchievementRepository,
  ) {}

  async recordGameEnded(game: GameRecord): Promise<void> {
    if (!game.winnerId) return;
    const modules = resolveModules(game.configJson.moduleIds);
    const actionRecords = await this.games.listActions(game.id);
    const stats = aggregateGameStats(
      modules,
      game.configJson.seatPlayerIds,
      game.seed,
      game.configJson.targetVictoryPoints,
      actionRecords.map((a) => a.actionJson),
    );

    const participants = await this.games.listParticipants(game.id);
    if (participants.length === 0) return;

    const seatCountKey = String(game.configJson.seatPlayerIds.length);
    const winnerId: PlayerId = game.winnerId;
    const winnerIsHuman = participants.some((p) => p.userId === winnerId);

    const currentRatings: Record<string, number> = {};
    for (const p of participants) {
      const record = await this.playerStats.get(p.userId);
      currentRatings[p.userId] = record?.ratingByPlayerCount[seatCountKey] ?? DEFAULT_RATING;
    }
    // A bot winning doesn't move any human's rating — Elo compares humans to
    // humans; a loss to a strong bot shouldn't tank a player's standing
    // among their peers, and no human "won" for their rating to rise either.
    const newRatings = winnerIsHuman
      ? updateRatings(
          currentRatings,
          participants.map((p) => p.userId),
          winnerId,
        )
      : currentRatings;

    for (const p of participants) {
      const isWinner = p.userId === winnerId;
      const updated = await this.playerStats.upsert(p.userId, (current) => ({
        userId: p.userId,
        gamesPlayed: current.gamesPlayed + 1,
        gamesWon: current.gamesWon + (isWinner ? 1 : 0),
        ratingByPlayerCount: {
          ...current.ratingByPlayerCount,
          [seatCountKey]: newRatings[p.userId] ?? DEFAULT_RATING,
        },
      }));

      const unlocked = evaluateAchievements(stats, p.userId, updated.gamesWon);
      for (const achievementId of unlocked) {
        await this.achievements.unlock(p.userId, achievementId, game.id);
      }
    }
  }
}
