import type { PrismaClient } from "@prisma/client";
import type { PlayerStatsRecord } from "../domain/types.js";

export interface PlayerStatsRepository {
  get(userId: string): Promise<PlayerStatsRecord | null>;
  /** Creates a zeroed row if none exists yet, then applies `update` to it. */
  upsert(
    userId: string,
    update: (current: PlayerStatsRecord) => PlayerStatsRecord,
  ): Promise<PlayerStatsRecord>;
}

function emptyStats(userId: string): PlayerStatsRecord {
  return { userId, gamesPlayed: 0, gamesWon: 0, ratingByPlayerCount: {} };
}

export class PrismaPlayerStatsRepository implements PlayerStatsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<PlayerStatsRecord | null> {
    return (await this.prisma.playerStats.findUnique({
      where: { userId },
    })) as unknown as PlayerStatsRecord | null;
  }

  async upsert(
    userId: string,
    update: (current: PlayerStatsRecord) => PlayerStatsRecord,
  ): Promise<PlayerStatsRecord> {
    const current = (await this.get(userId)) ?? emptyStats(userId);
    const next = update(current);
    return (await this.prisma.playerStats.upsert({
      where: { userId },
      create: {
        userId,
        gamesPlayed: next.gamesPlayed,
        gamesWon: next.gamesWon,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see gameRepository.ts's identical note on Prisma's Json input type.
        ratingByPlayerCount: next.ratingByPlayerCount as unknown as object,
      },
      update: {
        gamesPlayed: next.gamesPlayed,
        gamesWon: next.gamesWon,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see the identical note above.
        ratingByPlayerCount: next.ratingByPlayerCount as unknown as object,
      },
    })) as unknown as PlayerStatsRecord;
  }
}

/** See docs/architecture/server.md §0. */
export class InMemoryPlayerStatsRepository implements PlayerStatsRepository {
  private readonly byUserId = new Map<string, PlayerStatsRecord>();

  get(userId: string): Promise<PlayerStatsRecord | null> {
    return Promise.resolve(this.byUserId.get(userId) ?? null);
  }

  upsert(
    userId: string,
    update: (current: PlayerStatsRecord) => PlayerStatsRecord,
  ): Promise<PlayerStatsRecord> {
    const current = this.byUserId.get(userId) ?? emptyStats(userId);
    const next = update(current);
    this.byUserId.set(userId, next);
    return Promise.resolve(next);
  }
}
