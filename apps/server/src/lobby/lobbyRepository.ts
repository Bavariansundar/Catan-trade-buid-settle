import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BotDifficulty, LobbyRecord, LobbyStatus } from "../domain/types.js";

export interface CreateLobbyInput {
  readonly hostUserId: string;
  readonly isPublic: boolean;
  readonly code: string | null;
  readonly targetVictoryPoints: number;
  readonly enabledModuleIds: readonly string[];
  readonly turnTimerSeconds: number;
}

export interface LobbySettingsUpdate {
  readonly targetVictoryPoints?: number;
  readonly enabledModuleIds?: readonly string[];
  readonly turnTimerSeconds?: number;
}

export interface LobbyRepository {
  /** Creates the lobby and seats the host at seat 0. */
  create(input: CreateLobbyInput): Promise<LobbyRecord>;
  findById(id: string): Promise<LobbyRecord | null>;
  findByCode(code: string): Promise<LobbyRecord | null>;
  listPublicWaiting(): Promise<LobbyRecord[]>;
  addSeat(
    lobbyId: string,
    seatIndex: number,
    userId: string | null,
    botDifficulty: BotDifficulty | null,
  ): Promise<LobbyRecord>;
  removeSeat(lobbyId: string, seatIndex: number): Promise<LobbyRecord>;
  setSeatReady(lobbyId: string, seatIndex: number, isReady: boolean): Promise<LobbyRecord>;
  updateSettings(lobbyId: string, updates: LobbySettingsUpdate): Promise<LobbyRecord>;
  updateStatus(lobbyId: string, status: LobbyStatus): Promise<LobbyRecord>;
}

const LOBBY_INCLUDE = { seats: { orderBy: { seatIndex: "asc" as const } } };

export class PrismaLobbyRepository implements LobbyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateLobbyInput): Promise<LobbyRecord> {
    const lobby = await this.prisma.lobby.create({
      data: {
        ...input,
        enabledModuleIds: [...input.enabledModuleIds],
        seats: { create: [{ seatIndex: 0, userId: input.hostUserId }] },
      },
      include: LOBBY_INCLUDE,
    });
    return lobby;
  }

  async findById(id: string): Promise<LobbyRecord | null> {
    return this.prisma.lobby.findUnique({ where: { id }, include: LOBBY_INCLUDE });
  }

  async findByCode(code: string): Promise<LobbyRecord | null> {
    return this.prisma.lobby.findUnique({ where: { code }, include: LOBBY_INCLUDE });
  }

  async listPublicWaiting(): Promise<LobbyRecord[]> {
    return this.prisma.lobby.findMany({
      where: { isPublic: true, status: "WAITING" },
      include: LOBBY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async addSeat(
    lobbyId: string,
    seatIndex: number,
    userId: string | null,
    botDifficulty: BotDifficulty | null,
  ): Promise<LobbyRecord> {
    await this.prisma.lobbySeat.upsert({
      where: { lobbyId_seatIndex: { lobbyId, seatIndex } },
      create: { lobbyId, seatIndex, userId, botDifficulty },
      update: { userId, botDifficulty, isReady: false },
    });
    return (await this.findById(lobbyId))!;
  }

  async removeSeat(lobbyId: string, seatIndex: number): Promise<LobbyRecord> {
    await this.prisma.lobbySeat.deleteMany({ where: { lobbyId, seatIndex } });
    return (await this.findById(lobbyId))!;
  }

  async setSeatReady(lobbyId: string, seatIndex: number, isReady: boolean): Promise<LobbyRecord> {
    await this.prisma.lobbySeat.update({
      where: { lobbyId_seatIndex: { lobbyId, seatIndex } },
      data: { isReady },
    });
    return (await this.findById(lobbyId))!;
  }

  async updateSettings(lobbyId: string, updates: LobbySettingsUpdate): Promise<LobbyRecord> {
    const { enabledModuleIds, ...rest } = updates;
    await this.prisma.lobby.update({
      where: { id: lobbyId },
      data: enabledModuleIds ? { ...rest, enabledModuleIds: [...enabledModuleIds] } : rest,
    });
    return (await this.findById(lobbyId))!;
  }

  async updateStatus(lobbyId: string, status: LobbyStatus): Promise<LobbyRecord> {
    await this.prisma.lobby.update({ where: { id: lobbyId }, data: { status } });
    return (await this.findById(lobbyId))!;
  }
}

/** See docs/architecture/server.md §0. */
export class InMemoryLobbyRepository implements LobbyRepository {
  private readonly byId = new Map<string, LobbyRecord>();

  create(input: CreateLobbyInput): Promise<LobbyRecord> {
    const id = randomUUID();
    const lobby: LobbyRecord = {
      id,
      code: input.code,
      isPublic: input.isPublic,
      hostUserId: input.hostUserId,
      status: "WAITING",
      targetVictoryPoints: input.targetVictoryPoints,
      enabledModuleIds: input.enabledModuleIds,
      turnTimerSeconds: input.turnTimerSeconds,
      createdAt: new Date(),
      seats: [
        {
          id: randomUUID(),
          lobbyId: id,
          seatIndex: 0,
          userId: input.hostUserId,
          botDifficulty: null,
          isReady: false,
        },
      ],
    };
    this.byId.set(id, lobby);
    return Promise.resolve(lobby);
  }

  findById(id: string): Promise<LobbyRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findByCode(code: string): Promise<LobbyRecord | null> {
    for (const lobby of this.byId.values()) {
      if (lobby.code === code) return Promise.resolve(lobby);
    }
    return Promise.resolve(null);
  }

  listPublicWaiting(): Promise<LobbyRecord[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((l) => l.isPublic && l.status === "WAITING")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  private mustGet(lobbyId: string): LobbyRecord {
    const lobby = this.byId.get(lobbyId);
    if (!lobby) throw new Error(`No such lobby ${lobbyId}`);
    return lobby;
  }

  addSeat(
    lobbyId: string,
    seatIndex: number,
    userId: string | null,
    botDifficulty: BotDifficulty | null,
  ): Promise<LobbyRecord> {
    const lobby = this.mustGet(lobbyId);
    const seats = lobby.seats.filter((s) => s.seatIndex !== seatIndex);
    seats.push({ id: randomUUID(), lobbyId, seatIndex, userId, botDifficulty, isReady: false });
    seats.sort((a, b) => a.seatIndex - b.seatIndex);
    const updated = { ...lobby, seats };
    this.byId.set(lobbyId, updated);
    return Promise.resolve(updated);
  }

  removeSeat(lobbyId: string, seatIndex: number): Promise<LobbyRecord> {
    const lobby = this.mustGet(lobbyId);
    const updated = { ...lobby, seats: lobby.seats.filter((s) => s.seatIndex !== seatIndex) };
    this.byId.set(lobbyId, updated);
    return Promise.resolve(updated);
  }

  setSeatReady(lobbyId: string, seatIndex: number, isReady: boolean): Promise<LobbyRecord> {
    const lobby = this.mustGet(lobbyId);
    const seats = lobby.seats.map((s) => (s.seatIndex === seatIndex ? { ...s, isReady } : s));
    const updated = { ...lobby, seats };
    this.byId.set(lobbyId, updated);
    return Promise.resolve(updated);
  }

  updateSettings(lobbyId: string, updates: LobbySettingsUpdate): Promise<LobbyRecord> {
    const lobby = this.mustGet(lobbyId);
    const updated = { ...lobby, ...updates };
    this.byId.set(lobbyId, updated);
    return Promise.resolve(updated);
  }

  updateStatus(lobbyId: string, status: LobbyStatus): Promise<LobbyRecord> {
    const lobby = this.mustGet(lobbyId);
    const updated = { ...lobby, status };
    this.byId.set(lobbyId, updated);
    return Promise.resolve(updated);
  }
}
