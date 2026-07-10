import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Action } from "@hexhaven/engine";
import type {
  GameActionRecord,
  GameConfigSnapshot,
  GameParticipantRecord,
  GameRecord,
  GameStatus,
  Page,
} from "../domain/types.js";

export interface CreateGameInput {
  readonly lobbyId: string;
  readonly seed: string;
  readonly configJson: GameConfigSnapshot;
}

export interface ListForUserOptions {
  readonly status?: GameStatus;
  readonly cursor?: string;
  readonly limit: number;
}

export interface GameRepository {
  create(input: CreateGameInput): Promise<GameRecord>;
  findById(id: string): Promise<GameRecord | null>;
  findByLobbyId(lobbyId: string): Promise<GameRecord | null>;
  /** Appends at `seq` = (current max + 1); the unique (gameId, seq) DB constraint is a defense-in-depth check against the in-process per-game lock (see docs/architecture/server.md §5). */
  appendAction(gameId: string, playerId: string, action: Action): Promise<GameActionRecord>;
  listActions(gameId: string, sinceSeq?: number): Promise<GameActionRecord[]>;
  markEnded(gameId: string, winnerId: string): Promise<GameRecord>;
  /** Recorded once, at game start — human seats only (bots have no `User` row). */
  addParticipants(
    gameId: string,
    participants: readonly { userId: string; seatIndex: number }[],
  ): Promise<void>;
  listParticipants(gameId: string): Promise<GameParticipantRecord[]>;
  /** Paginated match history for one user, newest first. */
  listForUser(userId: string, options: ListForUserOptions): Promise<Page<GameRecord>>;
}

export class PrismaGameRepository implements GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateGameInput): Promise<GameRecord> {
    return (await this.prisma.game.create({
      data: {
        lobbyId: input.lobbyId,
        seed: input.seed,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by `tsc` (Prisma's Json input type needs it); ESLint's type-aware check resolves a duplicate @prisma/client instance in the pnpm store that disagrees.
        configJson: input.configJson as unknown as object,
      },
    })) as unknown as GameRecord;
  }

  async findById(id: string): Promise<GameRecord | null> {
    return (await this.prisma.game.findUnique({ where: { id } })) as unknown as GameRecord | null;
  }

  async findByLobbyId(lobbyId: string): Promise<GameRecord | null> {
    return (await this.prisma.game.findUnique({
      where: { lobbyId },
    })) as unknown as GameRecord | null;
  }

  async appendAction(gameId: string, playerId: string, action: Action): Promise<GameActionRecord> {
    const last = await this.prisma.gameAction.findFirst({
      where: { gameId },
      orderBy: { seq: "desc" },
    });
    const seq = (last?.seq ?? -1) + 1;
    return this.prisma.gameAction.create({
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see the identical note on PrismaGameRepository.create above.
      data: { gameId, seq, playerId, actionJson: action as unknown as object },
    }) as unknown as GameActionRecord;
  }

  async listActions(gameId: string, sinceSeq = -1): Promise<GameActionRecord[]> {
    return (await this.prisma.gameAction.findMany({
      where: { gameId, seq: { gt: sinceSeq } },
      orderBy: { seq: "asc" },
    })) as unknown as GameActionRecord[];
  }

  async markEnded(gameId: string, winnerId: string): Promise<GameRecord> {
    return (await this.prisma.game.update({
      where: { id: gameId },
      data: { status: "ENDED", winnerId, endedAt: new Date() },
    })) as unknown as GameRecord;
  }

  async addParticipants(
    gameId: string,
    participants: readonly { userId: string; seatIndex: number }[],
  ): Promise<void> {
    if (participants.length === 0) return;
    await this.prisma.gameParticipant.createMany({
      data: participants.map((p) => ({ gameId, userId: p.userId, seatIndex: p.seatIndex })),
    });
  }

  async listParticipants(gameId: string): Promise<GameParticipantRecord[]> {
    const rows = await this.prisma.gameParticipant.findMany({ where: { gameId } });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by `tsc` in this project's actual pinned @prisma/client resolution; ESLint's type-aware check resolves a duplicate instance in the pnpm store that disagrees (see the identical note elsewhere in this file).
    return rows as unknown as GameParticipantRecord[];
  }

  async listForUser(userId: string, options: ListForUserOptions): Promise<Page<GameRecord>> {
    const games = (await this.prisma.game.findMany({
      where: {
        participants: { some: { userId } },
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    })) as unknown as GameRecord[];
    const hasMore = games.length > options.limit;
    const items = games.slice(0, options.limit);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
}

/** See docs/architecture/server.md §0. */
export class InMemoryGameRepository implements GameRepository {
  private readonly byId = new Map<string, GameRecord>();
  private readonly byLobbyId = new Map<string, string>();
  private readonly actionsByGameId = new Map<string, GameActionRecord[]>();
  private readonly participantsByGameId = new Map<string, GameParticipantRecord[]>();

  create(input: CreateGameInput): Promise<GameRecord> {
    const game: GameRecord = {
      id: randomUUID(),
      lobbyId: input.lobbyId,
      seed: input.seed,
      configJson: input.configJson,
      status: "ACTIVE",
      winnerId: null,
      startedAt: new Date(),
      endedAt: null,
    };
    this.byId.set(game.id, game);
    this.byLobbyId.set(input.lobbyId, game.id);
    this.actionsByGameId.set(game.id, []);
    this.participantsByGameId.set(game.id, []);
    return Promise.resolve(game);
  }

  findById(id: string): Promise<GameRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findByLobbyId(lobbyId: string): Promise<GameRecord | null> {
    const id = this.byLobbyId.get(lobbyId);
    return Promise.resolve(id ? (this.byId.get(id) ?? null) : null);
  }

  appendAction(gameId: string, playerId: string, action: Action): Promise<GameActionRecord> {
    const actions = this.actionsByGameId.get(gameId) ?? [];
    const seq = actions.length;
    const record: GameActionRecord = {
      id: randomUUID(),
      gameId,
      seq,
      playerId,
      actionJson: action,
      createdAt: new Date(),
    };
    actions.push(record);
    this.actionsByGameId.set(gameId, actions);
    return Promise.resolve(record);
  }

  listActions(gameId: string, sinceSeq = -1): Promise<GameActionRecord[]> {
    return Promise.resolve(
      (this.actionsByGameId.get(gameId) ?? []).filter((a) => a.seq > sinceSeq),
    );
  }

  markEnded(gameId: string, winnerId: string): Promise<GameRecord> {
    const game = this.byId.get(gameId);
    if (!game) throw new Error(`No such game ${gameId}`);
    const updated: GameRecord = { ...game, status: "ENDED", winnerId, endedAt: new Date() };
    this.byId.set(gameId, updated);
    return Promise.resolve(updated);
  }

  addParticipants(
    gameId: string,
    participants: readonly { userId: string; seatIndex: number }[],
  ): Promise<void> {
    const existing = this.participantsByGameId.get(gameId) ?? [];
    this.participantsByGameId.set(gameId, [
      ...existing,
      ...participants.map((p) => ({ gameId, userId: p.userId, seatIndex: p.seatIndex })),
    ]);
    return Promise.resolve();
  }

  listParticipants(gameId: string): Promise<GameParticipantRecord[]> {
    return Promise.resolve(this.participantsByGameId.get(gameId) ?? []);
  }

  listForUser(userId: string, options: ListForUserOptions): Promise<Page<GameRecord>> {
    const candidates = [...this.byId.values()]
      .filter((g) => (this.participantsByGameId.get(g.id) ?? []).some((p) => p.userId === userId))
      .filter((g) => !options.status || g.status === options.status)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const startIndex = options.cursor
      ? candidates.findIndex((g) => g.id === options.cursor) + 1
      : 0;
    const page = candidates.slice(startIndex, startIndex + options.limit + 1);
    const hasMore = page.length > options.limit;
    const items = page.slice(0, options.limit);
    return Promise.resolve({ items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null });
  }
}
