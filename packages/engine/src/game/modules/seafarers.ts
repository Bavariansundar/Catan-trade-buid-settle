import { hexKey } from "../../coordinates.js";
import { generateBoard } from "../../board/generate.js";
import { createRngFromState, shuffle } from "../../rng.js";
import {
  validateBuildRoad,
  validateBuildSettlement,
  buildRoad,
  buildSettlement,
} from "../building.js";
import { revealHexesTouching } from "../exploration.js";
import { checkIslandBonus } from "../islandBonus.js";
import { applyAwardsAndVictory, requireBuildGate } from "./base.js";
import { isLandEdge, buildShip, moveShip, validateBuildShip, validateMoveShip } from "../ships.js";
import { movePirate, validateMovePirate } from "../pirate.js";
import { boardSpecForScenario, type ScenarioDefinition } from "../scenarios.js";
import type { RuleModule } from "../module.js";
import type { ApplySuccess } from "../types.js";

/**
 * Builds the Seafarers-style module for a specific scenario. A factory
 * (not a single constant) because different scenarios need different
 * board generation, starting state, and player-count range — see
 * docs/rules/seafarers-style.md.
 */
export function createSeafarersModule(scenario: ScenarioDefinition): RuleModule {
  return {
    id: `seafarers-style:${scenario.id}`,

    generateBoard: (options) => ({
      ...generateBoard(boardSpecForScenario(scenario), options),
      seaHexes: scenario.seaHexes,
    }),

    configExtension: (config) => ({
      ...config,
      playerCountRange: [
        Math.min(config.playerCountRange[0], scenario.recommendedPlayers[0]),
        Math.max(config.playerCountRange[1], scenario.recommendedPlayers[1]),
      ],
      pieceLimits: { ...config.pieceLimits, ships: 15 },
    }),

    initGameState: (state) => {
      const rng = createRngFromState(state.rngState);
      const discoveryBag = shuffle(scenario.discoveryBag, rng);
      return {
        ...state,
        pirateHex: scenario.pirateStartHex,
        hiddenHexes: new Map(scenario.hiddenLandHexes.map((h) => [hexKey(h), true as const])),
        discoveryBag,
        homeIslandHexes: scenario.homeIslandHexes,
        rngState: rng.getState(),
      };
    },

    extraVictoryPoints: (state, playerId) => {
      let points = 0;
      for (const awardedTo of state.islandBonusAwarded.values()) {
        if (awardedTo === playerId) points += 1;
      }
      return points;
    },

    actionHandlers: {
      // Overrides base's BUILD_ROAD: coastal/open-sea edges become
      // ship-only once sea hexes exist — see
      // docs/rules/seafarers-style.md §1. Everything else about roads
      // (cost, connectivity, piece limit, the build-gate) is unchanged,
      // so this delegates straight to building.ts's own functions plus
      // base's shared gate, rather than duplicating them.
      BUILD_ROAD: (state, action, modules) => {
        if (!isLandEdge(state, action.edge)) {
          return {
            code: "NOT_A_LAND_EDGE",
            message: `Edge ${action.edge.id} is a sea edge — build a ship instead`,
          };
        }
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

      // Overrides base's BUILD_SETTLEMENT to also resolve exploration
      // reveals and the island-settlement VP bonus — both must land
      // *before* the shared awards/victory post-processing runs, so a
      // settlement that both discovers gold-hex-style resources and
      // crosses the victory threshold in one action is detected correctly.
      BUILD_SETTLEMENT: (state, action, modules) => {
        const gateError = requireBuildGate(modules, state, action, action.playerId);
        if (gateError) return gateError;
        const error = validateBuildSettlement(state, action.playerId, action.vertex);
        if (error) return error;

        let result: ApplySuccess = {
          state: buildSettlement(state, action.playerId, action.vertex),
          events: [{ type: "SETTLEMENT_BUILT", playerId: action.playerId, vertex: action.vertex }],
        };
        const reveal = revealHexesTouching(result.state, action.vertex.hexes, action.playerId);
        result = { state: reveal.state, events: [...result.events, ...reveal.events] };
        const bonus = checkIslandBonus(result.state, action.playerId, action.vertex);
        result = { state: bonus.state, events: [...result.events, ...bonus.events] };

        return applyAwardsAndVictory(modules, result, action.playerId);
      },

      BUILD_SHIP: (state, action, modules) => {
        const gateError = requireBuildGate(modules, state, action, action.playerId);
        if (gateError) return gateError;
        const error = validateBuildShip(state, action.playerId, action.edge);
        if (error) return error;

        let result: ApplySuccess = {
          state: buildShip(state, action.playerId, action.edge),
          events: [{ type: "SHIP_BUILT", playerId: action.playerId, edge: action.edge }],
        };
        const reveal = revealHexesTouching(result.state, action.edge.hexes, action.playerId);
        result = { state: reveal.state, events: [...result.events, ...reveal.events] };

        return applyAwardsAndVictory(modules, result, action.playerId);
      },

      MOVE_SHIP: (state, action, modules) => {
        const gateError = requireBuildGate(modules, state, action, action.playerId);
        if (gateError) return gateError;
        const error = validateMoveShip(state, action.playerId, action.fromEdge, action.toEdge);
        if (error) return error;

        let result: ApplySuccess = {
          state: moveShip(state, action.playerId, action.fromEdge, action.toEdge),
          events: [
            {
              type: "SHIP_MOVED",
              playerId: action.playerId,
              fromEdge: action.fromEdge,
              toEdge: action.toEdge,
            },
          ],
        };
        const reveal = revealHexesTouching(result.state, action.toEdge.hexes, action.playerId);
        result = { state: reveal.state, events: [...result.events, ...reveal.events] };

        return applyAwardsAndVictory(modules, result, action.playerId);
      },

      // Self-gating (checks the "robber" phase + current player itself,
      // mirroring MOVE_ROBBER) — the acting player picks one of
      // MOVE_ROBBER/MOVE_PIRATE per 7 or played knight, never both.
      MOVE_PIRATE: (state, action) => {
        const error = validateMovePirate(
          state,
          action.playerId,
          action.hex,
          action.stealFromPlayerId,
        );
        if (error) return error;
        return movePirate(state, action.playerId, action.hex, action.stealFromPlayerId);
      },
    },
  };
}
