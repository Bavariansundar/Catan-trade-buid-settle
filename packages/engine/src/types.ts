import type { Edge, Hex } from "./coordinates.js";

export type PlayerId = string;

export type ResourceType = "wood" | "wheat" | "sheep" | "brick" | "ore";
export type TerrainType = ResourceType | "desert";
export type HarborType = "generic" | ResourceType;

export interface HexTile {
  readonly hex: Hex;
  readonly terrain: TerrainType;
  /** Number token 2–12 (never 7); `null` for the desert. */
  readonly number: number | null;
}

export interface Harbor {
  readonly edge: Edge;
  readonly type: HarborType;
}

export interface Board {
  readonly tiles: readonly HexTile[];
  readonly harbors: readonly Harbor[];
}

export interface Player {
  readonly id: PlayerId;
}

export type GamePhase = "setup" | "playing" | "ended";

/**
 * Placeholder — Phase 2 will flesh this out into the full turn state
 * machine (dice, resources, dev card deck, current player/phase, etc.).
 * Defined now so board generation has a home and later phases extend
 * rather than redesign it.
 */
export interface GameState {
  readonly board: Board;
  readonly players: readonly Player[];
  readonly phase: GamePhase;
}

export interface RuleError {
  readonly code: string;
  readonly message: string;
}

/**
 * Placeholder discriminated-union base — Phase 2 replaces `type: string`
 * with concrete action/event kinds (ROLL_DICE, BUILD_ROAD, etc.).
 */
export interface Action {
  readonly type: string;
  readonly playerId: PlayerId;
}

export interface GameEvent {
  readonly type: string;
}
