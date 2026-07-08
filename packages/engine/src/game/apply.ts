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
import { discard, moveRobber, validateDiscard, validateMoveRobber } from "./robber.js";
import { placeRoad, placeSettlement, validatePlaceRoad, validatePlaceSettlement } from "./setup.js";
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

function endTurn(state: GameState, playerId: PlayerId): ApplySuccess {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayerId = state.players[nextIndex]!.id;
  const events: GameEvent[] = [
    { type: "TURN_ENDED", playerId },
    { type: "TURN_STARTED", playerId: nextPlayerId },
  ];
  return {
    state: { ...state, currentPlayerIndex: nextIndex, diceRoll: null, phase: { name: "roll" } },
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
      return {
        state: buildRoad(state, action.playerId, action.edge),
        events: [{ type: "ROAD_BUILT", playerId: action.playerId, edge: action.edge }],
      };
    }
    case "BUILD_SETTLEMENT": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      const error = validateBuildSettlement(state, action.playerId, action.vertex);
      if (error) return error;
      return {
        state: buildSettlement(state, action.playerId, action.vertex),
        events: [{ type: "SETTLEMENT_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
    }
    case "BUILD_CITY": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      const error = validateBuildCity(state, action.playerId, action.vertex);
      if (error) return error;
      return {
        state: buildCity(state, action.playerId, action.vertex),
        events: [{ type: "CITY_BUILT", playerId: action.playerId, vertex: action.vertex }],
      };
    }
    case "END_TURN": {
      const turnError = requireMainPhaseCurrentPlayer(state, action.playerId);
      if (turnError) return turnError;
      return endTurn(state, action.playerId);
    }
  }
}
