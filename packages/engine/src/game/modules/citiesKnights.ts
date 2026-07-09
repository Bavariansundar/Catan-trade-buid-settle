import { createRngFromState, shuffle } from "../../rng.js";
import {
  activateKnight,
  buyKnight,
  chaseRobber,
  moveKnight,
  promoteKnight,
  validateActivateKnight,
  validateBuyKnight,
  validateChaseRobber,
  validateMoveKnight,
  validatePromoteKnight,
} from "../knights.js";
import { improveCityTrack, validateImproveCityTrack } from "../cityTracks.js";
import { rollDiceWithEvents } from "../cityKnightsDice.js";
import { buildCityWall, validateBuildCityWall } from "../cityWalls.js";
import { chooseCityToDowngrade, validateChooseCityToDowngrade } from "../barbarians.js";
import { buildMetropolis, validateBuildMetropolis } from "../metropolis.js";
import {
  playProgressCard,
  POLITICS_DECK,
  SCIENCE_DECK,
  TRADE_DECK,
  validatePlayProgressCard,
} from "../progressCards.js";
import { STARTING_COMMODITY_BANK } from "../resources.js";
import { validateRollDice } from "../dice.js";
import { applyAwardsAndVictory, requireBuildGate } from "./base.js";
import type { RuleModule } from "../module.js";
import type { PlayerId } from "../../types.js";
import type { GameState } from "../types.js";

/**
 * VP from landmarks drawn, successful barbarian-defense rewards, and
 * metropolises held — see docs/rules/cities-knights-style.md §8.
 */
function extraVictoryPoints(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  let points = player.landmarks.length + player.barbarianDefenseWins;
  for (const metropolis of state.metropolises.values()) {
    if (metropolis.playerId === playerId) points += 2;
  }
  return points;
}

export const CITIES_KNIGHTS_MODULE: RuleModule = {
  id: "cities-knights-style",

  configExtension: (config) => ({
    ...config,
    pieceLimits: { ...config.pieceLimits, knights: 3, cityWalls: 5 },
    targetVictoryPointsRange: [
      Math.min(config.targetVictoryPointsRange[0], 10),
      Math.max(config.targetVictoryPointsRange[1], 16),
    ],
  }),

  initGameState: (state) => {
    const rng = createRngFromState(state.rngState);
    const tradeDeck = shuffle(TRADE_DECK, rng);
    const politicsDeck = shuffle(POLITICS_DECK, rng);
    const scienceDeck = shuffle(SCIENCE_DECK, rng);
    return {
      ...state,
      commodityBank: { ...STARTING_COMMODITY_BANK },
      tradeDeck,
      politicsDeck,
      scienceDeck,
      rngState: rng.getState(),
    };
  },

  extraVictoryPoints,

  actionHandlers: {
    // Replaces base's dev card system entirely — see
    // docs/rules/cities-knights-style.md §9.1.
    BUY_DEV_CARD: () => ({
      code: "NOT_AVAILABLE",
      message: "Development cards are replaced by progress cards in this ruleset",
    }),
    PLAY_DEV_CARD: () => ({
      code: "NOT_AVAILABLE",
      message: "Development cards are replaced by progress cards in this ruleset",
    }),

    ROLL_DICE: (state, action, modules) => {
      const error = validateRollDice(state, action.playerId);
      if (error) return error;
      return applyAwardsAndVictory(
        modules,
        rollDiceWithEvents(state, action.playerId),
        action.playerId,
      );
    },

    IMPROVE_CITY_TRACK: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateImproveCityTrack(state, action);
      if (error) return error;
      return applyAwardsAndVictory(modules, improveCityTrack(state, action), action.playerId);
    },

    BUY_KNIGHT: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuyKnight(state, action);
      if (error) return error;
      return applyAwardsAndVictory(modules, buyKnight(state, action), action.playerId);
    },

    ACTIVATE_KNIGHT: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateActivateKnight(state, action);
      return error ?? activateKnight(state, action);
    },

    PROMOTE_KNIGHT: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validatePromoteKnight(state, action);
      return error ?? promoteKnight(state, action);
    },

    MOVE_KNIGHT: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateMoveKnight(state, action);
      return error ?? moveKnight(state, action);
    },

    CHASE_ROBBER: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateChaseRobber(state, action);
      return error ?? chaseRobber(state, action);
    },

    BUILD_CITY_WALL: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuildCityWall(state, action);
      return error ?? buildCityWall(state, action);
    },

    BUILD_METROPOLIS: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuildMetropolis(state, action);
      if (error) return error;
      return applyAwardsAndVictory(modules, buildMetropolis(state, action), action.playerId);
    },

    CHOOSE_CITY_TO_DOWNGRADE: (state, action) => {
      const error = validateChooseCityToDowngrade(state, action);
      return error ?? chooseCityToDowngrade(state, action);
    },

    PLAY_PROGRESS_CARD: (state, action, modules) => {
      const error = validatePlayProgressCard(state, action);
      if (error) return error;
      return applyAwardsAndVictory(modules, playProgressCard(state, action), action.playerId);
    },
  },
};
