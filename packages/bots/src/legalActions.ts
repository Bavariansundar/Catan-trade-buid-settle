import {
  bestMaritimeRatio,
  eligibleStealTargets,
  hexEquals,
  RESOURCE_TYPES,
  validateBuildCity,
  validateBuildRoad,
  validateBuildSettlement,
  validateBuyDevCard,
  validateMaritimeTrade,
  validatePlaceRoad,
  validatePlaceSettlement,
  validatePlayDevCard,
  validateRobberMovementCore,
  type Action,
  type DevCardType,
  type Edge,
  type GameState,
  type Hex,
  type PlayerId,
  type PlayMonopolyAction,
  type PlayRoadBuildingAction,
  type PlayYearOfPlentyAction,
  type ResourceHand,
  type ResourceType,
  type RuleModule,
  type Vertex,
} from "@hexhaven/engine";
import { allBoardEdges, allBoardVertices } from "./boardGeometry.js";

/**
 * Candidate generators for the bounded, board-driven parts of the action
 * space (building, robber, maritime trade). Every candidate is filtered
 * through the *same* `validate*` function the engine's own dispatcher uses,
 * so a bot can never construct an action that `applyAction` would reject —
 * this is what "must never propose an illegal action" (PROMPTS.md Phase 7)
 * actually means in practice: reuse the validator, don't re-derive the rule.
 *
 * Player-to-player trading is deliberately not modeled here — see
 * types.ts's scope note.
 */

export function legalSettlementVertices(state: GameState, playerId: PlayerId): Vertex[] {
  const validator =
    state.phase.name === "setup" ? validatePlaceSettlement : validateBuildSettlement;
  return allBoardVertices(state).filter((v) => validator(state, playerId, v) === null);
}

export function legalCityVertices(state: GameState, playerId: PlayerId): Vertex[] {
  return allBoardVertices(state).filter((v) => validateBuildCity(state, playerId, v) === null);
}

export function legalRoadEdges(state: GameState, playerId: PlayerId): Edge[] {
  const validator = state.phase.name === "setup" ? validatePlaceRoad : validateBuildRoad;
  return allBoardEdges(state).filter((e) => validator(state, playerId, e) === null);
}

/** `{hex, stealFromPlayerId}` pairs legal for a robber-move-shaped action (MOVE_ROBBER or a knight card). */
export function robberMoveCandidates(
  state: GameState,
  playerId: PlayerId,
): { hex: Hex; stealFromPlayerId: PlayerId | null }[] {
  const candidates: { hex: Hex; stealFromPlayerId: PlayerId | null }[] = [];
  for (const tile of state.board.tiles) {
    if (hexEquals(tile.hex, state.robber)) continue;
    const eligible = eligibleStealTargets(state, tile.hex, playerId);
    if (eligible.length === 0) {
      if (validateRobberMovementCore(state, playerId, tile.hex, null) === null) {
        candidates.push({ hex: tile.hex, stealFromPlayerId: null });
      }
      continue;
    }
    for (const targetId of eligible) {
      if (validateRobberMovementCore(state, playerId, tile.hex, targetId) === null) {
        candidates.push({ hex: tile.hex, stealFromPlayerId: targetId });
      }
    }
  }
  return candidates;
}

export function legalMaritimeTrades(
  state: GameState,
  playerId: PlayerId,
): { give: ResourceType; get: ResourceType }[] {
  const candidates: { give: ResourceType; get: ResourceType }[] = [];
  for (const give of RESOURCE_TYPES) {
    for (const get of RESOURCE_TYPES) {
      if (give === get) continue;
      if (validateMaritimeTrade(state, playerId, give, get) === null) {
        candidates.push({ give, get });
      }
    }
  }
  return candidates;
}

export function canBuyDevCard(state: GameState, playerId: PlayerId): boolean {
  return validateBuyDevCard(state, playerId) === null;
}

/** Dev card types this player can currently play (bought before this turn, not victory_point). */
export function playableDevCardTypes(
  state: GameState,
  playerId: PlayerId,
): Exclude<DevCardType, "victory_point">[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.devCardPlayedThisTurn) return [];
  const types = new Set<Exclude<DevCardType, "victory_point">>();
  for (const card of player.devCards) {
    if (card.type === "victory_point") continue;
    if (card.boughtTurn < state.turnNumber) types.add(card.type);
  }
  return [...types];
}

/** Best available maritime ratio for `give`, used to size a maritime trade for affordability planning. */
export function maritimeRatioFor(state: GameState, playerId: PlayerId, give: ResourceType): number {
  return bestMaritimeRatio(state, playerId, give);
}

/** Discard down to `owed` cards, largest stacks first — see docs note in ruleBasedBot.ts. */
export function sensibleDiscard(hand: ResourceHand, owed: number): Partial<ResourceHand> {
  const discard: Partial<ResourceHand> = {};
  const remaining: Record<ResourceType, number> = { ...hand };
  let left = owed;
  while (left > 0) {
    const [resource] = RESOURCE_TYPES.filter((r) => remaining[r] > 0).sort(
      (a, b) => remaining[b] - remaining[a],
    );
    if (!resource) break;
    discard[resource] = (discard[resource] ?? 0) + 1;
    remaining[resource] -= 1;
    left -= 1;
  }
  return discard;
}

/**
 * Full candidate action set for `playerId` in the current phase — used by
 * HeuristicBot's one-ply lookahead and MCTSBot's root-level branching.
 * Bounded and cheap: robber/dev-card candidates reuse the same small
 * generators above rather than a full generic cross-product.
 */
export function enumerateLegalActions(
  state: GameState,
  playerId: PlayerId,
  modules: readonly RuleModule[],
): Action[] {
  const actions: Action[] = [];

  if (state.phase.name === "setup") {
    if (state.phase.awaitingRoad) {
      for (const edge of legalRoadEdges(state, playerId)) {
        actions.push({ type: "PLACE_ROAD", playerId, edge });
      }
    } else {
      for (const vertex of legalSettlementVertices(state, playerId)) {
        actions.push({ type: "PLACE_SETTLEMENT", playerId, vertex });
      }
    }
    return actions;
  }

  if (state.phase.name === "roll") {
    actions.push({ type: "ROLL_DICE", playerId });
    return actions;
  }

  if (state.phase.name === "robber") {
    for (const { hex, stealFromPlayerId } of robberMoveCandidates(state, playerId)) {
      actions.push({ type: "MOVE_ROBBER", playerId, hex, stealFromPlayerId });
    }
    return actions;
  }

  if (state.phase.name === "main" || state.phase.name === "specialBuild") {
    const gated = (action: Action): boolean =>
      state.players[state.currentPlayerIndex]?.id === playerId ||
      modules.some((m) => m.extraActionGates?.[action.type]?.(state, action) === true);

    for (const vertex of legalSettlementVertices(state, playerId)) {
      const action: Action = { type: "BUILD_SETTLEMENT", playerId, vertex };
      if (gated(action)) actions.push(action);
    }
    for (const vertex of legalCityVertices(state, playerId)) {
      const action: Action = { type: "BUILD_CITY", playerId, vertex };
      if (gated(action)) actions.push(action);
    }
    for (const edge of legalRoadEdges(state, playerId)) {
      const action: Action = { type: "BUILD_ROAD", playerId, edge };
      if (gated(action)) actions.push(action);
    }
    if (canBuyDevCard(state, playerId)) {
      const action: Action = { type: "BUY_DEV_CARD", playerId };
      if (gated(action)) actions.push(action);
    }

    if (state.phase.name === "main" && state.players[state.currentPlayerIndex]?.id === playerId) {
      for (const { give, get } of legalMaritimeTrades(state, playerId)) {
        actions.push({ type: "MARITIME_TRADE", playerId, give, get });
      }
      for (const cardType of playableDevCardTypes(state, playerId)) {
        actions.push(...devCardActionCandidates(state, playerId, cardType));
      }
      actions.push({ type: "END_TURN", playerId });
    }
    if (state.phase.name === "specialBuild" && state.phase.queue[0] === playerId) {
      actions.push({ type: "PASS_SPECIAL_BUILD", playerId });
    }
    return actions;
  }

  return actions;
}

function devCardActionCandidates(
  state: GameState,
  playerId: PlayerId,
  cardType: Exclude<DevCardType, "victory_point">,
): Action[] {
  switch (cardType) {
    case "knight":
      return robberMoveCandidates(state, playerId).map(({ hex, stealFromPlayerId }) => ({
        type: "PLAY_DEV_CARD",
        card: "knight",
        playerId,
        hex,
        stealFromPlayerId,
      }));
    case "monopoly": {
      const candidates: PlayMonopolyAction[] = RESOURCE_TYPES.map((resource) => ({
        type: "PLAY_DEV_CARD",
        card: "monopoly",
        playerId,
        resource,
      }));
      return candidates.filter((action) => validatePlayDevCard(state, action) === null);
    }
    case "year_of_plenty": {
      const candidates: PlayYearOfPlentyAction[] = [];
      for (let i = 0; i < RESOURCE_TYPES.length; i++) {
        for (let j = i; j < RESOURCE_TYPES.length; j++) {
          candidates.push({
            type: "PLAY_DEV_CARD",
            card: "year_of_plenty",
            playerId,
            resources: [RESOURCE_TYPES[i]!, RESOURCE_TYPES[j]!],
          });
        }
      }
      return candidates.filter((action) => validatePlayDevCard(state, action) === null);
    }
    case "road_building": {
      const edges = legalRoadEdges(state, playerId).slice(0, 4);
      const candidates: PlayRoadBuildingAction[] = [];
      for (const edge of edges) {
        candidates.push({ type: "PLAY_DEV_CARD", card: "road_building", playerId, edges: [edge] });
      }
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          candidates.push({
            type: "PLAY_DEV_CARD",
            card: "road_building",
            playerId,
            edges: [edges[i]!, edges[j]!],
          });
        }
      }
      return candidates.filter((action) => validatePlayDevCard(state, action) === null);
    }
  }
}
