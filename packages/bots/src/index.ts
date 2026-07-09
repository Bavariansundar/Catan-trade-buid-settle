import { BASE_BOARD_SPEC, generateBoard } from "@hexhaven/engine";

/** Placeholder — Phase 7 replaces this with the actual bot tiers. */
export function botsPlaceholder(): number {
  return generateBoard(BASE_BOARD_SPEC, { seed: "bots-scaffold" }).tiles.length;
}
