import { apiRequest } from "./client.js";

export type LobbyStatus = "WAITING" | "STARTED" | "CLOSED";
export type BotDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface LobbySeat {
  readonly id: string;
  readonly lobbyId: string;
  readonly seatIndex: number;
  readonly userId: string | null;
  readonly botDifficulty: BotDifficulty | null;
  readonly isReady: boolean;
}

export interface Lobby {
  readonly id: string;
  readonly code: string | null;
  readonly isPublic: boolean;
  readonly hostUserId: string;
  readonly status: LobbyStatus;
  readonly targetVictoryPoints: number;
  readonly enabledModuleIds: readonly string[];
  readonly turnTimerSeconds: number;
  readonly createdAt: string;
  readonly seats: readonly LobbySeat[];
}

export interface CreateLobbyInput {
  readonly isPublic: boolean;
  readonly targetVictoryPoints: number;
  readonly enabledModuleIds: string[];
  readonly turnTimerSeconds?: number;
}

export function createLobby(accessToken: string, input: CreateLobbyInput): Promise<Lobby> {
  return apiRequest<Lobby>("/lobbies", { method: "POST", body: input, accessToken });
}

export function listPublicLobbies(accessToken: string): Promise<Lobby[]> {
  return apiRequest<Lobby[]>("/lobbies", { accessToken });
}

export function joinLobbyById(accessToken: string, lobbyId: string): Promise<Lobby> {
  return apiRequest<Lobby>(`/lobbies/${lobbyId}/join`, { method: "POST", accessToken });
}

export function joinLobbyByCode(accessToken: string, code: string): Promise<Lobby> {
  return apiRequest<Lobby>("/lobbies/join-by-code", {
    method: "POST",
    body: { code },
    accessToken,
  });
}
