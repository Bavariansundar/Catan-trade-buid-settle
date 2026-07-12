import type { Action } from "@baychearsbar/engine";

/**
 * Domain types independent of Prisma's generated shapes — every repository
 * interface speaks these, so business logic (and in-memory test doubles)
 * never needs to import `@prisma/client` at all. See
 * docs/architecture/server.md §0 for why this indirection exists here.
 */

export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: Date;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedById: string | null;
  readonly createdAt: Date;
}

export type LobbyStatus = "WAITING" | "STARTED" | "CLOSED";
export type BotDifficulty = "EASY" | "MEDIUM" | "HARD";
export type GameStatus = "ACTIVE" | "ENDED" | "ABANDONED";

export interface LobbySeatRecord {
  readonly id: string;
  readonly lobbyId: string;
  readonly seatIndex: number;
  readonly userId: string | null;
  readonly botDifficulty: BotDifficulty | null;
  readonly isReady: boolean;
}

export interface LobbyRecord {
  readonly id: string;
  readonly code: string | null;
  readonly isPublic: boolean;
  readonly hostUserId: string;
  readonly status: LobbyStatus;
  readonly targetVictoryPoints: number;
  readonly enabledModuleIds: readonly string[];
  readonly turnTimerSeconds: number;
  readonly createdAt: Date;
  readonly seats: readonly LobbySeatRecord[];
}

export interface GameRecord {
  readonly id: string;
  readonly lobbyId: string;
  readonly seed: string;
  readonly configJson: GameConfigSnapshot;
  readonly status: GameStatus;
  readonly winnerId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/** Frozen at game start: which modules and seat->engine-playerId mapping this game uses. */
export interface GameConfigSnapshot {
  readonly moduleIds: readonly string[];
  readonly targetVictoryPoints: number;
  readonly seatPlayerIds: readonly string[]; // index-aligned with the lobby's seats
  readonly turnTimerSeconds: number;
  /** engine playerId -> difficulty, present only for bot-controlled seats. */
  readonly botSeats: Readonly<Record<string, BotDifficulty>>;
}

export interface GameActionRecord {
  readonly id: string;
  readonly gameId: string;
  readonly seq: number;
  readonly playerId: string;
  readonly actionJson: Action;
  readonly createdAt: Date;
}

export interface PlayerStatsRecord {
  readonly userId: string;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  /** Elo-style rating keyed by seat count (as a string — JSON object keys always are). */
  readonly ratingByPlayerCount: Readonly<Record<string, number>>;
}

/** One row per human seat (bot seats have no `User`, so they're never recorded). */
export interface GameParticipantRecord {
  readonly gameId: string;
  readonly userId: string;
  readonly seatIndex: number;
}

export type AchievementId =
  | "first_win"
  | "ten_wins"
  | "longest_road_master"
  | "largest_army_commander"
  | "trade_baron"
  | "lucky_seven"
  | "settler"
  | "city_builder"
  | "robber_baron"
  | "flawless_victory";

export interface AchievementRecord {
  readonly userId: string;
  readonly achievementId: AchievementId;
  readonly gameId: string | null;
  readonly unlockedAt: Date;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** Pass back as `cursor` to fetch the next page; `null` means this is the last page. */
  readonly nextCursor: string | null;
}
