import { randomInt } from "node:crypto";
import type { BotDifficulty, LobbyRecord } from "../domain/types.js";
import type { LobbyRepository, LobbySettingsUpdate } from "./lobbyRepository.js";

export const MAX_SEATS = 6;
export const MIN_SEATS_TO_START = 2;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud

export type LobbyErrorCode =
  | "LOBBY_NOT_FOUND"
  | "LOBBY_FULL"
  | "SEAT_TAKEN"
  | "SEAT_EMPTY"
  | "NOT_HOST"
  | "NOT_READY"
  | "ALREADY_STARTED"
  | "INVALID_SEAT_INDEX";

export class LobbyError extends Error {
  constructor(
    public readonly code: LobbyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LobbyError";
  }
}

export interface CreateLobbyOptions {
  readonly isPublic: boolean;
  readonly targetVictoryPoints: number;
  readonly enabledModuleIds: readonly string[];
  readonly turnTimerSeconds: number;
}

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  return code;
}

/** Create/join/leave/ready-check/settings/start business logic — see docs/architecture/server.md §3. */
export class LobbyService {
  constructor(private readonly lobbies: LobbyRepository) {}

  async createLobby(hostUserId: string, options: CreateLobbyOptions): Promise<LobbyRecord> {
    const code = options.isPublic ? null : generateInviteCode();
    return this.lobbies.create({ hostUserId, code, ...options });
  }

  async getLobby(lobbyId: string): Promise<LobbyRecord> {
    return this.requireLobby(lobbyId);
  }

  async listPublicLobbies(): Promise<LobbyRecord[]> {
    return this.lobbies.listPublicWaiting();
  }

  async joinById(lobbyId: string, userId: string): Promise<LobbyRecord> {
    return this.joinLobby(await this.requireLobby(lobbyId), userId);
  }

  async joinByCode(code: string, userId: string): Promise<LobbyRecord> {
    const lobby = await this.lobbies.findByCode(code);
    if (!lobby) throw new LobbyError("LOBBY_NOT_FOUND", `No lobby with code ${code}`);
    return this.joinLobby(lobby, userId);
  }

  private async joinLobby(lobby: LobbyRecord, userId: string): Promise<LobbyRecord> {
    this.requireWaiting(lobby);
    if (lobby.seats.some((s) => s.userId === userId)) return lobby;
    const seatIndex = this.firstFreeSeatIndex(lobby);
    if (seatIndex === null) throw new LobbyError("LOBBY_FULL", "Lobby is full");
    return this.lobbies.addSeat(lobby.id, seatIndex, userId, null);
  }

  /** Host leaving closes the lobby (no host-transfer in this phase — see docs/architecture/server.md). */
  async leave(lobbyId: string, userId: string): Promise<LobbyRecord> {
    const lobby = await this.requireLobby(lobbyId);
    if (lobby.hostUserId === userId) return this.lobbies.updateStatus(lobbyId, "CLOSED");
    const seat = lobby.seats.find((s) => s.userId === userId);
    if (!seat) return lobby;
    return this.lobbies.removeSeat(lobbyId, seat.seatIndex);
  }

  async addBot(
    lobbyId: string,
    hostUserId: string,
    seatIndex: number,
    difficulty: BotDifficulty,
  ): Promise<LobbyRecord> {
    const lobby = await this.requireHost(lobbyId, hostUserId);
    this.requireWaiting(lobby);
    this.requireValidSeatIndex(seatIndex);
    if (lobby.seats.some((s) => s.seatIndex === seatIndex)) {
      throw new LobbyError("SEAT_TAKEN", `Seat ${String(seatIndex)} is occupied`);
    }
    return this.lobbies.addSeat(lobbyId, seatIndex, null, difficulty);
  }

  async removeSeat(lobbyId: string, hostUserId: string, seatIndex: number): Promise<LobbyRecord> {
    const lobby = await this.requireHost(lobbyId, hostUserId);
    this.requireWaiting(lobby);
    if (seatIndex === 0) throw new LobbyError("NOT_HOST", "The host's own seat cannot be removed");
    return this.lobbies.removeSeat(lobbyId, seatIndex);
  }

  async setReady(lobbyId: string, userId: string, isReady: boolean): Promise<LobbyRecord> {
    const lobby = await this.requireLobby(lobbyId);
    const seat = lobby.seats.find((s) => s.userId === userId);
    if (!seat) throw new LobbyError("SEAT_EMPTY", `${userId} is not seated in this lobby`);
    return this.lobbies.setSeatReady(lobbyId, seat.seatIndex, isReady);
  }

  async updateSettings(
    lobbyId: string,
    hostUserId: string,
    updates: LobbySettingsUpdate,
  ): Promise<LobbyRecord> {
    const lobby = await this.requireHost(lobbyId, hostUserId);
    this.requireWaiting(lobby);
    return this.lobbies.updateSettings(lobbyId, updates);
  }

  canStart(lobby: LobbyRecord): boolean {
    if (lobby.seats.length < MIN_SEATS_TO_START) return false;
    return lobby.seats.every((s) => s.userId === null || s.isReady);
  }

  async start(lobbyId: string, hostUserId: string): Promise<LobbyRecord> {
    const lobby = await this.requireHost(lobbyId, hostUserId);
    this.requireWaiting(lobby);
    if (!this.canStart(lobby)) {
      throw new LobbyError("NOT_READY", "Not every human seat is ready, or too few seats filled");
    }
    return this.lobbies.updateStatus(lobbyId, "STARTED");
  }

  private firstFreeSeatIndex(lobby: LobbyRecord): number | null {
    const taken = new Set(lobby.seats.map((s) => s.seatIndex));
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!taken.has(i)) return i;
    }
    return null;
  }

  private requireValidSeatIndex(seatIndex: number): void {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= MAX_SEATS) {
      throw new LobbyError("INVALID_SEAT_INDEX", `Seat index must be 0-${String(MAX_SEATS - 1)}`);
    }
  }

  private requireWaiting(lobby: LobbyRecord): void {
    if (lobby.status !== "WAITING") {
      throw new LobbyError("ALREADY_STARTED", `Lobby ${lobby.id} is not accepting changes`);
    }
  }

  private async requireLobby(id: string): Promise<LobbyRecord> {
    const lobby = await this.lobbies.findById(id);
    if (!lobby) throw new LobbyError("LOBBY_NOT_FOUND", `No such lobby ${id}`);
    return lobby;
  }

  private async requireHost(id: string, userId: string): Promise<LobbyRecord> {
    const lobby = await this.requireLobby(id);
    if (lobby.hostUserId !== userId) throw new LobbyError("NOT_HOST", `${userId} is not the host`);
    return lobby;
  }
}
