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

export interface RuleError {
  readonly code: string;
  readonly message: string;
}
