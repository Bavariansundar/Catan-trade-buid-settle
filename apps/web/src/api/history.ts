import type { Action } from "@hexhaven/engine";
import { apiRequest } from "./client.js";

export type GameStatus = "ACTIVE" | "ENDED" | "ABANDONED";

export interface GameConfigSnapshot {
  readonly moduleIds: readonly string[];
  readonly targetVictoryPoints: number;
  readonly seatPlayerIds: readonly string[];
  readonly turnTimerSeconds: number;
  readonly botSeats: Readonly<Record<string, string>>;
}

export interface GameRecord {
  readonly id: string;
  readonly lobbyId: string;
  readonly seed: string;
  readonly configJson: GameConfigSnapshot;
  readonly status: GameStatus;
  readonly winnerId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface GameParticipantRecord {
  readonly gameId: string;
  readonly userId: string;
  readonly seatIndex: number;
}

export interface VpSnapshot {
  readonly turnNumber: number;
  readonly vpByPlayer: Readonly<Record<string, number>>;
}

export interface GameStats {
  readonly diceFrequency: Readonly<Record<number, number>>;
  readonly resourcesGainedPerPlayer: Readonly<Record<string, Record<string, number>>>;
  readonly resourcesSpentPerPlayer: Readonly<Record<string, Record<string, number>>>;
  readonly tradesPerPlayer: Readonly<Record<string, number>>;
  readonly vpProgression: readonly VpSnapshot[];
  readonly awardTurnsHeld: Readonly<
    Record<string, { longestRoadTurns: number; largestArmyTurns: number }>
  >;
  readonly settlementsBuiltPerPlayer: Readonly<Record<string, number>>;
  readonly citiesBuiltPerPlayer: Readonly<Record<string, number>>;
  readonly resourcesStolenPerPlayer: Readonly<Record<string, number>>;
  readonly discardsPerPlayer: Readonly<Record<string, number>>;
  readonly sevensRolledPerPlayer: Readonly<Record<string, number>>;
  readonly finalLongestRoadHolder: string | null;
  readonly finalLargestArmyHolder: string | null;
  readonly winnerId: string | null;
}

export interface GameDetail {
  readonly game: GameRecord;
  readonly participants: readonly GameParticipantRecord[];
  readonly stats: GameStats;
  readonly actions: readonly Action[];
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function listHistory(
  accessToken: string,
  options: { status?: GameStatus; cursor?: string } = {},
): Promise<Page<GameRecord>> {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return apiRequest<Page<GameRecord>>(`/history${query ? `?${query}` : ""}`, { accessToken });
}

export function getGameDetail(accessToken: string, gameId: string): Promise<GameDetail> {
  return apiRequest<GameDetail>(`/history/${gameId}`, { accessToken });
}
