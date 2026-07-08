import type { ResourceType, RuleError } from "../types.js";
import { hasRoadConnectivity, isEdgeOnBoard } from "./building.js";
import { applyRobberMovementCore, validateRobberMovementCore } from "./robber.js";
import { addHands, canAfford, subtractHands, BUILD_COSTS } from "./resources.js";
import type {
  ApplySuccess,
  DevCardType,
  GameEvent,
  GameState,
  Player,
  PlayDevCardAction,
} from "./types.js";

/** Standard deck composition per CLAUDE.md: 14 knights, 5 VP, 2 each of the rest. */
export const DEV_CARD_DECK: readonly DevCardType[] = [
  ...Array<DevCardType>(14).fill("knight"),
  ...Array<DevCardType>(5).fill("victory_point"),
  ...Array<DevCardType>(2).fill("monopoly"),
  ...Array<DevCardType>(2).fill("road_building"),
  ...Array<DevCardType>(2).fill("year_of_plenty"),
];

function findPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function validateBuyDevCard(state: GameState, playerId: string): RuleError | null {
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Can only buy a dev card during the main phase" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn` };
  }
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
  if (state.devDeck.length === 0) {
    return { code: "DECK_EMPTY", message: "The development card deck is empty" };
  }
  if (!canAfford(player.hand, BUILD_COSTS.devCard)) {
    return { code: "CANNOT_AFFORD", message: `${playerId} cannot afford a development card` };
  }
  return null;
}

/** Assumes {@link validateBuyDevCard} already passed. */
export function buyDevCard(state: GameState, playerId: string): ApplySuccess {
  const [drawnCard, ...remainingDeck] = state.devDeck;
  const card = drawnCard!;

  const players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          hand: subtractHands(p.hand, BUILD_COSTS.devCard),
          devCards: [...p.devCards, { type: card, boughtTurn: state.turnNumber }],
        }
      : p,
  );

  return {
    state: {
      ...state,
      players,
      bank: addHands(state.bank, BUILD_COSTS.devCard),
      devDeck: remainingDeck,
    },
    events: [{ type: "DEV_CARD_BOUGHT", playerId, card }],
  };
}

function playableDevCardIndex(
  state: GameState,
  player: Player,
  card: Exclude<DevCardType, "victory_point">,
): number {
  return player.devCards.findIndex((c) => c.type === card && c.boughtTurn < state.turnNumber);
}

function withoutDevCardAt(player: Player, index: number): Player["devCards"] {
  return [...player.devCards.slice(0, index), ...player.devCards.slice(index + 1)];
}

export function validatePlayDevCard(state: GameState, action: PlayDevCardAction): RuleError | null {
  if (state.phase.name !== "main") {
    return {
      code: "WRONG_PHASE",
      message: "Can only play a development card during the main phase",
    };
  }
  if (state.players[state.currentPlayerIndex]?.id !== action.playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${action.playerId}'s turn` };
  }
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  if (player.devCardPlayedThisTurn) {
    return { code: "ALREADY_PLAYED", message: "Only one development card may be played per turn" };
  }
  const index = playableDevCardIndex(state, player, action.card);
  if (index === -1) {
    return {
      code: "CARD_NOT_PLAYABLE",
      message: `${action.playerId} has no playable ${action.card} card (none owned, or bought this turn)`,
    };
  }

  switch (action.card) {
    case "knight":
      return validateRobberMovementCore(
        state,
        action.playerId,
        action.hex,
        action.stealFromPlayerId,
      );
    case "road_building": {
      if (action.edges.length < 1 || action.edges.length > 2) {
        return { code: "INVALID_EDGE_COUNT", message: "Road building plays 1 or 2 free roads" };
      }
      const available = Math.min(2, player.pieces.roads);
      if (action.edges.length > available) {
        return {
          code: "NO_PIECES_LEFT",
          message: `${action.playerId} does not have enough road pieces left`,
        };
      }
      let scratchRoads = new Map(state.roads);
      for (const edge of action.edges) {
        if (!isEdgeOnBoard(state, edge)) {
          return { code: "OUT_OF_BOUNDS", message: `Edge ${edge.id} is not on the board` };
        }
        if (scratchRoads.has(edge.id)) {
          return { code: "EDGE_OCCUPIED", message: `Edge ${edge.id} already has a road` };
        }
        const scratchState = { ...state, roads: scratchRoads };
        if (!hasRoadConnectivity(scratchState, action.playerId, edge)) {
          return {
            code: "NOT_CONNECTED",
            message: `Edge ${edge.id} does not connect to ${action.playerId}'s road network`,
          };
        }
        scratchRoads = new Map(scratchRoads);
        scratchRoads.set(edge.id, action.playerId);
      }
      return null;
    }
    case "year_of_plenty": {
      const [first, second] = action.resources;
      const needed: Partial<Record<ResourceType, number>> = {};
      needed[first] = (needed[first] ?? 0) + 1;
      needed[second] = (needed[second] ?? 0) + 1;
      for (const [resource, amount] of Object.entries(needed) as [ResourceType, number][]) {
        if (state.bank[resource] < amount) {
          return {
            code: "BANK_EMPTY",
            message: `The bank does not have ${String(amount)} ${resource} left`,
          };
        }
      }
      return null;
    }
    case "monopoly":
      return null;
  }
}

/** Assumes {@link validatePlayDevCard} already passed. */
export function playDevCard(state: GameState, action: PlayDevCardAction): ApplySuccess {
  const player = findPlayer(state, action.playerId)!;
  const cardIndex = playableDevCardIndex(state, player, action.card);
  const devCardsAfterRemoval = withoutDevCardAt(player, cardIndex);

  const baseState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId
        ? { ...p, devCards: devCardsAfterRemoval, devCardPlayedThisTurn: true }
        : p,
    ),
  };

  switch (action.card) {
    case "knight": {
      const robberResult = applyRobberMovementCore(
        baseState,
        action.playerId,
        action.hex,
        action.stealFromPlayerId,
      );
      const players = robberResult.state.players.map((p) =>
        p.id === action.playerId ? { ...p, knightsPlayed: p.knightsPlayed + 1 } : p,
      );
      const events: GameEvent[] = [
        { type: "KNIGHT_PLAYED", playerId: action.playerId },
        ...robberResult.events,
      ];
      return { state: { ...robberResult.state, players }, events };
    }
    case "monopoly": {
      const seized = new Map<string, number>();
      let totalSeized = 0;
      for (const victim of baseState.players) {
        if (victim.id === action.playerId) continue;
        const amount = victim.hand[action.resource];
        if (amount > 0) {
          seized.set(victim.id, amount);
          totalSeized += amount;
        }
      }
      const players = baseState.players.map((p) => {
        if (p.id === action.playerId) {
          return { ...p, hand: addHands(p.hand, { [action.resource]: totalSeized }) };
        }
        const seizedAmount = seized.get(p.id);
        return seizedAmount
          ? { ...p, hand: subtractHands(p.hand, { [action.resource]: seizedAmount }) }
          : p;
      });
      const events: GameEvent[] = [
        { type: "MONOPOLY_PLAYED", playerId: action.playerId, resource: action.resource, seized },
      ];
      return { state: { ...baseState, players }, events };
    }
    case "road_building": {
      let roads = new Map(baseState.roads);
      let players = baseState.players;
      for (const edge of action.edges) {
        roads = new Map(roads);
        roads.set(edge.id, action.playerId);
        players = players.map((p) =>
          p.id === action.playerId
            ? { ...p, pieces: { ...p.pieces, roads: p.pieces.roads - 1 } }
            : p,
        );
      }
      const events: GameEvent[] = [
        { type: "ROAD_BUILDING_PLAYED", playerId: action.playerId, edges: action.edges },
      ];
      return { state: { ...baseState, roads, players }, events };
    }
    case "year_of_plenty": {
      const grant: Partial<Record<ResourceType, number>> = {};
      for (const resource of action.resources) {
        grant[resource] = (grant[resource] ?? 0) + 1;
      }
      const players = baseState.players.map((p) =>
        p.id === action.playerId ? { ...p, hand: addHands(p.hand, grant) } : p,
      );
      const bank = subtractHands(baseState.bank, grant);
      const events: GameEvent[] = [
        { type: "YEAR_OF_PLENTY_PLAYED", playerId: action.playerId, resources: action.resources },
      ];
      return { state: { ...baseState, players, bank }, events };
    }
  }
}

export function hiddenVictoryPointCount(player: Player): number {
  return player.devCards.filter((c) => c.type === "victory_point").length;
}

export function playerDevCardCounts(player: Player): Partial<Record<DevCardType, number>> {
  const counts: Partial<Record<DevCardType, number>> = {};
  for (const card of player.devCards) counts[card.type] = (counts[card.type] ?? 0) + 1;
  return counts;
}
