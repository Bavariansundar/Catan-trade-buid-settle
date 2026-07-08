import type { PlayerId, RuleError } from "../types.js";
import {
  buildCity,
  buildRoad,
  buildSettlement,
  validateBuildCity,
  validateBuildRoad,
  validateBuildSettlement,
} from "./building.js";
import { rollDice, validateRollDice } from "./dice.js";
import { buyDevCard, playDevCard, validateBuyDevCard, validatePlayDevCard } from "./devCards.js";
import { computeLongestRoad, recomputeLongestRoad } from "./longestRoad.js";
import { recomputeLargestArmy } from "./largestArmy.js";
import { discard, moveRobber, validateDiscard, validateMoveRobber } from "./robber.js";
import { placeRoad, placeSettlement, validatePlaceRoad, validatePlaceSettlement } from "./setup.js";
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
} from "./trading.js";
import { hasWon } from "./victory.js";
import type { Action, ApplyResult, ApplySuccess, GameEvent, GameState } from "./types.js";

function requireMainPhaseCurrentPlayer(state: GameState, playerId: PlayerId): RuleError | null {
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Not in the main (build) phase" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn` };
  }
  return null;
}

/**
 * Cross-cutting post-processing run after any action that could move a
 * scoring award or cross the victory threshold: recompute Longest Road and
 * Largest Army, then check victory for `actingPlayerId` only — "win only on
 * your own turn" means we never check it for a third party who merely
 * benefited from the acting player's move (e.g. a Longest Road transfer).
 */
function applyAwardsAndVictory(result: ApplySuccess, actingPlayerId: PlayerId): ApplySuccess {
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

  if (state.phase.name !== "ended" && hasWon(state, actingPlayerId)) {
    state = { ...state, phase: { name: "ended", winner: actingPlayerId } };
    events.push({ type: "GAME_ENDED", winner: actingPlayerId });
  }

  return { state, events };
}

function endTurn(state: GameState, playerId: PlayerId): ApplySuccess {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayerId = state.players[nextIndex]!.id;
  const events: GameEvent[] = [
    { type: "TURN_ENDED", playerId },
    { type: "TURN_STARTED", playerId: nextPlayerId },
  ];
  return {
    state: {
      ...state,
      currentPlayerIndex: nextIndex,
      diceRoll: null,
      phase: { name: "roll" },
      turnNumber: state.turnNumber + 1,
      tradeOffers: new Map(), // open offers only ever make sense on the proposer's own turn
      players: state.players.map((p) => ({ ...p, devCardPlayedThisTurn: false })),
    },
    events,
  };
}

/**
 * The engine's single entry point: validates `action` against `state` and,
 * if legal, returns the resulting state + emitted events. Never mutates
 * `state`. All randomness is drawn from `state.rngState`, so replaying the
 * same action log from the same initial state is deterministic.
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  switch (action.type) {
    case "PLACE_SETTLEMENT": {
      const error = validatePlaceSettlement(state, action.playerId, action.vertex);
      return error ?? placeSettlement(state, action.playerId, action.vertex);
    }
    case "PLACE_ROAD": {
      const error = validatePlaceRoad(state, action.playerId, action.edge);
      return error ?? placeRoad(state, action.playerId, action.edge);
    }
    case "ROLL_DICE": {
      const error = validateRollDice(state, action.playerId);
      return error ?? rollDice(state, action.playerId);
    }
    case "DISCARD": {
      const error = validateDiscard(state, action.playerId, action.resources);
      return error ?? discard(state, action.playerId, action.resources);
    }
    case "MOVE_ROBBER": {
      const error = validateMoveRobber(
        state,
        action.playerId,
        action.hex,
        action.stealFromPlayerId,
      );
      return error ?? moveRobber(state, action.playerId, action.hex, action.stealFromPlayerId);
    }
    case "BUILD_ROAD": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      const error = validateBuildRoad(state, action.playerId, action.edge);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildRoad(state, action.playerId, action.edge),
        events: [{ type: "ROAD_BUILT", playerId: action.playerId, edge: action.edge }],
      };
      return applyAwardsAndVictory(result, action.playerId);
    }
    case "BUILD_SETTLEMENT": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      const error = validateBuildSettlement(state, action.playerId, action.vertex);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildSettlement(state, action.playerId, action.vertex),
        events: [{ type: "SETTLEMENT_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
      return applyAwardsAndVictory(result, action.playerId);
    }
    case "BUILD_CITY": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      const error = validateBuildCity(state, action.playerId, action.vertex);
      if (error) return error;
      const result: ApplySuccess = {
        state: buildCity(state, action.playerId, action.vertex),
        events: [{ type: "CITY_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
      return applyAwardsAndVictory(result, action.playerId);
    }
    case "BUY_DEV_CARD": {
      const error = validateBuyDevCard(state, action.playerId);
      if (error) return error;
      return applyAwardsAndVictory(buyDevCard(state, action.playerId), action.playerId);
    }
    case "PLAY_DEV_CARD": {
      const error = validatePlayDevCard(state, action);
      if (error) return error;
      return applyAwardsAndVictory(playDevCard(state, action), action.playerId);
    }
    case "PROPOSE_TRADE": {
      const error = validateProposeTrade(state, action);
      return error ?? proposeTrade(state, action);
    }
    case "ACCEPT_TRADE": {
      const error = validateAcceptTrade(state, action);
      return error ?? acceptTrade(state, action);
    }
    case "REJECT_TRADE": {
      const error = validateRejectTrade(state, action);
      return error ?? rejectTrade(state, action);
    }
    case "COUNTER_TRADE": {
      const error = validateCounterTrade(state, action);
      return error ?? counterTrade(state, action);
    }
    case "CANCEL_TRADE": {
      const error = validateCancelTrade(state, action);
      return error ?? cancelTrade(state, action);
    }
    case "MARITIME_TRADE": {
      const error = validateMaritimeTrade(state, action.playerId, action.give, action.get);
      return error ?? maritimeTrade(state, action.playerId, action.give, action.get);
    }
    case "END_TURN": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      return endTurn(state, action.playerId);
    }
  }
}
