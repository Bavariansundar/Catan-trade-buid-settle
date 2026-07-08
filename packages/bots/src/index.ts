import { generateBoard } from "@hexhaven/engine";

/** Placeholder — Phase 7 replaces this with the actual bot tiers. */
export function botsPlaceholder(): number {
  return generateBoard({ seed: "bots-scaffold" }).tiles.length;
}
