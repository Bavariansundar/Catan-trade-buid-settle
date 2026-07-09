import type { ResourceType } from "../types.js";
import type { CommodityHand, CommodityType, ResourceHand } from "./types.js";

export const RESOURCE_TYPES: readonly ResourceType[] = ["wood", "wheat", "sheep", "brick", "ore"];
export const COMMODITY_TYPES: readonly CommodityType[] = ["cloth", "coin", "paper"];

export function emptyHand(): ResourceHand {
  return { wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 };
}

export function handTotal(hand: Partial<ResourceHand>): number {
  return RESOURCE_TYPES.reduce((sum, r) => sum + (hand[r] ?? 0), 0);
}

export function addHands(a: ResourceHand, b: Partial<ResourceHand>): ResourceHand {
  const result = { ...a };
  for (const r of RESOURCE_TYPES) result[r] += b[r] ?? 0;
  return result;
}

export function subtractHands(a: ResourceHand, b: Partial<ResourceHand>): ResourceHand {
  const result = { ...a };
  for (const r of RESOURCE_TYPES) result[r] -= b[r] ?? 0;
  return result;
}

export function canAfford(hand: ResourceHand, cost: Partial<ResourceHand>): boolean {
  return RESOURCE_TYPES.every((r) => hand[r] >= (cost[r] ?? 0));
}

export const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { ore: 3, wheat: 2 },
  devCard: { ore: 1, wheat: 1, sheep: 1 },
  /** Seafarers-style only. */
  ship: { wood: 1, sheep: 1 },
  /** Cities & Knights-style only — see docs/rules/cities-knights-style.md §5. */
  knight: { ore: 1, wheat: 1, sheep: 1 },
  /** Cities & Knights-style only. */
  cityWall: { brick: 2 },
} as const satisfies Record<string, Partial<ResourceHand>>;

export const PIECE_LIMITS = {
  settlements: 5,
  cities: 4,
  roads: 15,
  /** Seafarers-style only; base/five-six-players never spend it. */
  ships: 0,
  /** Cities & Knights-style only; 0 otherwise. */
  knights: 0,
  /** Cities & Knights-style only; 0 otherwise. */
  cityWalls: 0,
} as const;

export function emptyCommodityHand(): CommodityHand {
  return { cloth: 0, coin: 0, paper: 0 };
}

export function addCommodities(a: CommodityHand, b: Partial<CommodityHand>): CommodityHand {
  const result = { ...a };
  for (const c of COMMODITY_TYPES) result[c] += b[c] ?? 0;
  return result;
}

export function subtractCommodities(a: CommodityHand, b: Partial<CommodityHand>): CommodityHand {
  const result = { ...a };
  for (const c of COMMODITY_TYPES) result[c] -= b[c] ?? 0;
  return result;
}

export function canAffordCommodity(hand: CommodityHand, cost: Partial<CommodityHand>): boolean {
  return COMMODITY_TYPES.every((c) => hand[c] >= (cost[c] ?? 0));
}

/** Cost (in that track's commodity) to raise a city-improvement track from `level` to `level + 1`. */
export function trackUpgradeCost(level: number): number {
  return level + 1;
}

/** Cost (in coin) to promote a knight from `level` to `level + 1`. */
export function knightPromotionCost(level: number): number {
  return level;
}

/** Cities & Knights-style only; 0 otherwise. */
export const STARTING_COMMODITY_BANK: CommodityHand = {
  cloth: 10,
  coin: 10,
  paper: 10,
};

export const STARTING_BANK: ResourceHand = {
  wood: 19,
  wheat: 19,
  sheep: 19,
  brick: 19,
  ore: 19,
};
