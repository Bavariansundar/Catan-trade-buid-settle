import type { ResourceType } from "../types.js";
import type { ResourceHand } from "./types.js";

export const RESOURCE_TYPES: readonly ResourceType[] = ["wood", "wheat", "sheep", "brick", "ore"];

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
} as const satisfies Record<string, Partial<ResourceHand>>;

export const PIECE_LIMITS = {
  settlements: 5,
  cities: 4,
  roads: 15,
} as const;

export const STARTING_BANK: ResourceHand = {
  wood: 19,
  wheat: 19,
  sheep: 19,
  brick: 19,
  ore: 19,
};
