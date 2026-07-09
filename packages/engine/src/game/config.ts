import { DEV_CARD_DECK } from "./devCards.js";
import { BUILD_COSTS, PIECE_LIMITS, STARTING_BANK } from "./resources.js";
import type { DevCardType, PlayerPieceSupply, ResourceHand } from "./types.js";

/**
 * Everything modules can adjust that isn't board shape or action/phase
 * behavior: player-count and target-VP bounds, per-player piece limits, the
 * starting bank, the (pre-shuffle) dev card deck composition, and build
 * costs. See docs/architecture/modules.md §3.
 */
export interface GameConfig {
  readonly playerCountRange: readonly [min: number, max: number];
  readonly pieceLimits: PlayerPieceSupply;
  readonly startingBank: ResourceHand;
  readonly devCardDeck: readonly DevCardType[];
  readonly buildCosts: typeof BUILD_COSTS;
  readonly targetVictoryPointsRange: readonly [min: number, max: number];
}

export const BASE_CONFIG: GameConfig = {
  playerCountRange: [2, 4],
  pieceLimits: { ...PIECE_LIMITS },
  startingBank: { ...STARTING_BANK },
  devCardDeck: DEV_CARD_DECK,
  buildCosts: BUILD_COSTS,
  targetVictoryPointsRange: [10, 14],
};
