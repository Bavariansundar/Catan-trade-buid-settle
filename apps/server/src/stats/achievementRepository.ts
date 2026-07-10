import type { PrismaClient } from "@prisma/client";
import type { AchievementId, AchievementRecord } from "../domain/types.js";

export interface AchievementRepository {
  listForUser(userId: string): Promise<AchievementRecord[]>;
  /** No-ops (rather than erroring) if already unlocked — achievement checks may re-evaluate across games. */
  unlock(userId: string, achievementId: AchievementId, gameId: string | null): Promise<void>;
}

export class PrismaAchievementRepository implements AchievementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string): Promise<AchievementRecord[]> {
    return (await this.prisma.achievement.findMany({
      where: { userId },
    })) as unknown as AchievementRecord[];
  }

  async unlock(userId: string, achievementId: AchievementId, gameId: string | null): Promise<void> {
    await this.prisma.achievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId, gameId },
      update: {},
    });
  }
}

/** See docs/architecture/server.md §0. */
export class InMemoryAchievementRepository implements AchievementRepository {
  private readonly byUserId = new Map<string, AchievementRecord[]>();

  listForUser(userId: string): Promise<AchievementRecord[]> {
    return Promise.resolve(this.byUserId.get(userId) ?? []);
  }

  unlock(userId: string, achievementId: AchievementId, gameId: string | null): Promise<void> {
    const existing = this.byUserId.get(userId) ?? [];
    if (existing.some((a) => a.achievementId === achievementId)) return Promise.resolve();
    existing.push({ userId, achievementId, gameId, unlockedAt: new Date() });
    this.byUserId.set(userId, existing);
    return Promise.resolve();
  }
}
