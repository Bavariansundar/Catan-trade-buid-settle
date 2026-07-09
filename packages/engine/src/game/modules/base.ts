import type { PlayerId, RuleError } from "../../types.js";
import {
  buildCity,
  buildRoad,
  buildSettlement,
  validateBuildCity,
  validateBuildRoad,
  validateBuildSettlement,
} from "../building.js";
import { rollDice, validateRollDice } from "../dice.js";
import { buyDevCard, playDevCard, validateBuyDevCard, validatePlayDevCard } from "../devCards.js";
import { computeLongestRoad, recomputeLongestRoad } from "../longestRoad.js";
import { recomputeLargestArmy } from "../largestArmy.js";
import { discard, moveRobber, validateDiscard, validateMoveRobber } from "../robber.js";
import {
  placeRoad,
  placeSettlement,
  validatePlaceRoad,
  validatePlaceSettlement,
} from "../setup.js";
import {
  acceptTrade,
  cancelTrade,
  counterTrade,
  maritimeTrade,
  proposeTrade,
  rejectTrade,
  validateAcceptTrade,
  validateCancelTrade,
  validateCounterTrade,
  validateMaritimeTrade,
  validateProposeTrade,
  validateRejectTrade,
} from "../trading.js";
import { hasWon } from "../victory.js";
import type { RuleModule } from "../module.js";
import type { Action, ApplySuccess, GameEvent, GameState } from "../types.js";

/**
 * Base's own gate for the "build-ish" action types other modules extend
 * (main phase + current player), OR'd with any active module's
 * `extraActionGates` for that type — see docs/architecture/modules.md §4.
 * Exported so other modules that fully own a new build-ish action type
 * (seafarers' BUILD_SHIP/MOVE_SHIP) can reuse the exact same gate instead
 * of reimplementing it.
 */
export function requireBuildGate(
  modules: readonly RuleModule[],
  state: GameState,
  action: Action,
  playerId: PlayerId,
): RuleError | null {
  if (state.phase.name === "main" && state.players[state.currentPlayerIndex]?.id === playerId) {
    return null;
  }
  const extended = modules.some((m) => m.extraActionGates?.[action.type]?.(state, action));
  if (extended) return null;
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Not in the main (build) phase" };
  }
  return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn` };
}

/**
 * Cross-cutting post-processing run after any action that could move a
 * scoring award or cross the victory threshold: recompute Longest Road and
 * Largest Army, then check victory for `actingPlayerId` only — "win only on
 * your own turn" means we never check it for a third party who merely
 * benefited from the acting player's move (e.g. a Longest Road transfer).
 * Exported so a module that fully owns a new building-ish action (or
 * wraps an existing one) can run the same post-processing after its own
 * effects, in the right order — see seafarers' BUILD_SETTLEMENT override,
 * which must apply its island-bonus VP *before* this checks victory.
 */
export function applyAwardsAndVictory(
  modules: readonly RuleModule[],
  result: ApplySuccess,
  actingPlayerId: PlayerId,
): ApplySuccess {
  let state = result.state;
  const events: GameEvent[] = [...result.events];

  const newLongestRoadHolder = recomputeLongestRoad(state);
  if (newLongestRoadHolder !== state.longestRoadPlayerId) {
    if (state.longestRoadPlayerId && newLongestRoadHolder === null) {
      events.push({ type: "LONGEST_ROAD_LOST", playerId: state.longestRoadPlayerId });
    }
    if (newLongestRoadHolder) {
      events.push({
        type: "LONGEST_ROAD_AWARDED",
        playerId: newLongestRoadHolder,
        length: computeLongestRoad(state, newLongestRoadHolder),
      });
    }
    state = { ...state, longestRoadPlayerId: newLongestRoadHolder };
  }

  const newLargestArmyHolder = recomputeLargestArmy(state);
  if (newLargestArmyHolder !== state.largestArmyPlayerId && newLargestArmyHolder !== null) {
    const holder = state.players.find((p) => p.id === newLargestArmyHolder)!;
    events.push({
      type: "LARGEST_ARMY_AWARDED",
      playerId: newLargestArmyHolder,
      knights: holder.knightsPlayed,
    });
    state = { ...state, largestArmyPlayerId: newLargestArmyHolder };
  }

  if (state.phase.name !== "ended" && hasWon(modules, state, actingPlayerId)) {
    state = { ...state, phase: { name: "ended", winner: actingPlayerId } };
    events.push({ type: "GAME_ENDED", winner: actingPlayerId });
  }

  return { state, events };
}

/**
 * Core END_TURN transition (advance to next player, reset per-turn state),
 * then folds every active module's `afterEndTurn` hook over the result in
 * order — five-six-players uses this to redirect into its special build
 * phase instead of straight to the next roll.
 */
function endTurn(
  modules: readonly RuleModule[],
  state: GameState,
  playerId: PlayerId,
): ApplySuccess {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayerId = state.players[nextIndex]!.id;
  const events: GameEvent[] = [
    { type: "TURN_ENDED", playerId },
    { type: "TURN_STARTED", playerId: nextPlayerId },
  ];
  let nextState: GameState = {
    ...state,
    currentPlayerIndex: nextIndex,
    diceRoll: null,
    phase: { name: "roll" },
    turnNumber: state.turnNumber + 1,
    tradeOffers: new Map(), // open offers only ever make sense on the proposer's own turn
    players: state.players.map((p) => ({ ...p, devCardPlayedThisTurn: false })),
  };

  for (const module of modules) {
    const hookResult = module.afterEndTurn?.(nextState, playerId);
    if (hookResult) {
      nextState = hookResult.state;
      events.push(...(hookResult.events ?? []));
    }
  }

  return { state: nextState, events };
}

export const BASE_MODULE: RuleModule = {
  id: "base",
  actionHandlers: {
    PLACE_SETTLEMENT: (state, action) => {
      const error = validatePlaceSettlement(state, action.playerId, action.vertex);
      return error ?? placeSettlement(state, action.playerId, action.vertex);
    },
    PLACE_ROAD: (state, action) => {
      const error = validatePlaceRoad(state, action.playerId, action.edge);
      return error ?? placeRoad(state, action.playerId, action.edge);
    },
    ROLL_DICE: (state, action) => {
      const error = validateRollDice(state, action.playerId);
      return error ?? rollDice(state, action.playerId);
    },
    DISCARD: (state, action) => {
      const error = validateDiscard(state, action.playerId, action.resources);
      return error ?? discard(state, action.playerId, action.resources);
    },
    MOVE_ROBBER: (state, action) => {
      const error = validateMoveRobber(
        state,
        action.playerId,
        action.hex,
        action.stealFromPlayerId,
      );
      return error ?? moveRobber(state, action.playerId, action.hex, action.stealFromPlayerId);
    },
    BUILD_ROAD: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuildRoad(state, action.playerId, action.edge);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildRoad(state, action.playerId, action.edge),
        events: [{ type: "ROAD_BUILT", playerId: action.playerId, edge: action.edge }],
      };
      return applyAwardsAndVictory(modules, result, action.playerId);
    },
    BUILD_SETTLEMENT: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuildSettlement(state, action.playerId, action.vertex);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildSettlement(state, action.playerId, action.vertex),
        events: [{ type: "SETTLEMENT_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
      return applyAwardsAndVictory(modules, result, action.playerId);
    },
    BUILD_CITY: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuildCity(state, action.playerId, action.vertex);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildCity(state, action.playerId, action.vertex),
        events: [{ type: "CITY_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
      return applyAwardsAndVictory(modules, result, action.playerId);
    },
    BUY_DEV_CARD: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      const error = validateBuyDevCard(state, action.playerId);
      if (error) return error;
      return applyAwardsAndVictory(modules, buyDevCard(state, action.playerId), action.playerId);
    },
    PLAY_DEV_CARD: (state, action, modules) => {
      const error = validatePlayDevCard(state, action);
      if (error) return error;
      return applyAwardsAndVictory(modules, playDevCard(state, action), action.playerId);
    },
    PROPOSE_TRADE: (state, action) => {
      const error = validateProposeTrade(state, action);
      return error ?? proposeTrade(state, action);
    },
    ACCEPT_TRADE: (state, action) => {
      const error = validateAcceptTrade(state, action);
      return error ?? acceptTrade(state, action);
    },
    REJECT_TRADE: (state, action) => {
      const error = validateRejectTrade(state, action);
      return error ?? rejectTrade(state, action);
    },
    COUNTER_TRADE: (state, action) => {
      const error = validateCounterTrade(state, action);
      return error ?? counterTrade(state, action);
    },
    CANCEL_TRADE: (state, action) => {
      const error = validateCancelTrade(state, action);
      return error ?? cancelTrade(state, action);
    },
    MARITIME_TRADE: (state, action) => {
      const error = validateMaritimeTrade(state, action.playerId, action.give, action.get);
      return error ?? maritimeTrade(state, action.playerId, action.give, action.get);
    },
    END_TURN: (state, action, modules) => {
      const gateError = requireBuildGate(modules, state, action, action.playerId);
      if (gateError) return gateError;
      return endTurn(modules, state, action.playerId);
    },
  },
};
