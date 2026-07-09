import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { RefreshTokenRecord } from "../domain/types.js";

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  findById(id: string): Promise<RefreshTokenRecord | null>;
  /** Marks `id` revoked and links it to the token that replaced it (rotation). */
  markRotated(id: string, replacedById: string): Promise<void>;
  markRevoked(id: string): Promise<void>;
  /**
   * Revokes `id` and every descendant reachable by following `replacedById`
   * forward — used when a *revoked* token is presented again, meaning it
   * may have been stolen: the whole rest of the chain (which a thief and
   * the legitimate user might now both be racing to use) is invalidated.
   * See docs/architecture/server.md §2.
   */
  revokeChainFrom(id: string): Promise<void>;
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    return this.prisma.refreshToken.create({ data: input });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async findById(id: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  async markRotated(id: string, replacedById: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    });
  }

  async markRevoked(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeChainFrom(id: string): Promise<void> {
    let current = await this.findById(id);
    while (current) {
      if (!current.revokedAt) await this.markRevoked(current.id);
      current = current.replacedById ? await this.findById(current.replacedById) : null;
    }
  }
}

/** See docs/architecture/server.md §0. */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly byId = new Map<string, RefreshTokenRecord>();

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      revokedAt: null,
      replacedById: null,
      createdAt: new Date(),
      ...input,
    };
    this.byId.set(record.id, record);
    return Promise.resolve(record);
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const record of this.byId.values()) {
      if (record.tokenHash === tokenHash) return Promise.resolve(record);
    }
    return Promise.resolve(null);
  }

  findById(id: string): Promise<RefreshTokenRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  markRotated(id: string, replacedById: string): Promise<void> {
    const record = this.byId.get(id);
    if (!record) return Promise.resolve();
    this.byId.set(id, { ...record, revokedAt: new Date(), replacedById });
    return Promise.resolve();
  }

  markRevoked(id: string): Promise<void> {
    const record = this.byId.get(id);
    if (!record) return Promise.resolve();
    this.byId.set(id, { ...record, revokedAt: record.revokedAt ?? new Date() });
    return Promise.resolve();
  }

  async revokeChainFrom(id: string): Promise<void> {
    let current = await this.findById(id);
    while (current) {
      if (!current.revokedAt) await this.markRevoked(current.id);
      current = current.replacedById ? await this.findById(current.replacedById) : null;
    }
  }
}
