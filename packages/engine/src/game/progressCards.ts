import type { RuleError } from "../types.js";
import { hasRoadConnectivity, isEdgeOnBoard } from "./building.js";
import { addCommodities, addHands, subtractCommodities, subtractHands } from "./resources.js";
import type {
  ApplySuccess,
  GameEvent,
  GameState,
  Player,
  PlayProgressCardAction,
  PoliticsCardType,
  ProgressCardType,
  ScienceCardType,
  Track,
  TradeCardType,
} from "./types.js";

/** Proposed MVP roster — see docs/rules/cities-knights-style.md §3. */
export const TRADE_DECK: readonly TradeCardType[] = [
  "bazaar",
  "bazaar",
  "bazaar",
  "toll_bridge",
  "toll_bridge",
  "windfall",
  "windfall",
  "harbor_master",
];

export const POLITICS_DECK: readonly PoliticsCardType[] = [
  "mobilize",
  "mobilize",
  "mobilize",
  "bribery",
  "bribery",
  "sabotage",
  "sabotage",
  "founding_charter",
];

export const SCIENCE_DECK: readonly ScienceCardType[] = [
  "blueprint",
  "blueprint",
  "breakthrough",
  "breakthrough",
  "apprentice",
  "apprentice",
  "grand_library",
];

export const LANDMARK_CARDS: ReadonlySet<ProgressCardType> = new Set([
  "harbor_master",
  "founding_charter",
  "grand_library",
]);

function findPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function drawFromDeck<T extends ProgressCardType>(
  state: GameState,
  track: Track,
  deck: readonly T[],
): { deck: readonly T[]; players: readonly Player[]; events: GameEvent[] } {
  let remaining = deck;
  let players = state.players;
  const events: GameEvent[] = [];

  for (const player of state.players) {
    if (player.cityImprovements[track] < 1) continue;
    const [drawn, ...rest] = remaining;
    if (!drawn) break; // deck exhausted — nobody else draws this trigger
    remaining = rest;

    if (LANDMARK_CARDS.has(drawn)) {
      players = players.map((p) =>
        p.id === player.id ? { ...p, landmarks: [...p.landmarks, drawn] } : p,
      );
      events.push({ type: "LANDMARK_ACQUIRED", playerId: player.id, card: drawn });
    } else {
      players = players.map((p) =>
        p.id === player.id ? { ...p, progressCards: [...p.progressCards, { type: drawn }] } : p,
      );
      events.push({ type: "PROGRESS_CARD_DRAWN", playerId: player.id, deck: track, card: drawn });
    }
  }

  return { deck: remaining, players, events };
}

/**
 * Every player with level >= 1 in `track` draws the top card of that deck,
 * for free, in seating order — see docs/rules/cities-knights-style.md §3. A
 * no-op if the deck is already empty. Landmark cards score +1 VP immediately
 * instead of becoming a playable card.
 */
export function drawProgressCardsForTrack(state: GameState, track: Track): ApplySuccess {
  if (track === "trade") {
    const result = drawFromDeck(state, track, state.tradeDeck);
    if (result.events.length === 0) return { state, events: [] };
    return {
      state: { ...state, tradeDeck: result.deck, players: result.players },
      events: result.events,
    };
  }
  if (track === "politics") {
    const result = drawFromDeck(state, track, state.politicsDeck);
    if (result.events.length === 0) return { state, events: [] };
    return {
      state: { ...state, politicsDeck: result.deck, players: result.players },
      events: result.events,
    };
  }
  const result = drawFromDeck(state, track, state.scienceDeck);
  if (result.events.length === 0) return { state, events: [] };
  return {
    state: { ...state, scienceDeck: result.deck, players: result.players },
    events: result.events,
  };
}

function findCardIndex(player: Player, card: ProgressCardType): number {
  return player.progressCards.findIndex((c) => c.type === card);
}

function withoutCardAt(player: Player, index: number): Player["progressCards"] {
  return [...player.progressCards.slice(0, index), ...player.progressCards.slice(index + 1)];
}

export function validatePlayProgressCard(
  state: GameState,
  action: PlayProgressCardAction,
): RuleError | null {
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Can only play a progress card during the main phase" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== action.playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${action.playerId}'s turn` };
  }
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  if (findCardIndex(player, action.card) === -1) {
    return { code: "CARD_NOT_PLAYABLE", message: `${action.playerId} has no ${action.card} card` };
  }

  switch (action.card) {
    case "bazaar": {
      if (action.give === action.get) {
        return { code: "SAME_RESOURCE", message: "Cannot trade a resource for itself" };
      }
      if (player.hand[action.give] < 2) {
        return { code: "INSUFFICIENT_RESOURCES", message: `Need 2 ${action.give}` };
      }
      if (state.bank[action.get] < 1) {
        return { code: "BANK_EMPTY", message: `The bank has no ${action.get} left` };
      }
      return null;
    }
    case "toll_bridge": {
      let hand = player.hand;
      let bank = state.bank;
      for (const trade of action.trades) {
        if (trade.give === trade.get) {
          return { code: "SAME_RESOURCE", message: "Cannot trade a resource for itself" };
        }
        if (hand[trade.give] < 2) {
          return { code: "INSUFFICIENT_RESOURCES", message: `Need 2 ${trade.give}` };
        }
        if (bank[trade.get] < 1) {
          return { code: "BANK_EMPTY", message: `The bank has no ${trade.get} left` };
        }
        hand = addHands(subtractHands(hand, { [trade.give]: 2 }), { [trade.get]: 1 });
        bank = addHands(subtractHands(bank, { [trade.get]: 1 }), { [trade.give]: 2 });
      }
      return null;
    }
    case "windfall":
      return null;
    case "mobilize":
      return null;
    case "bribery": {
      if (action.targetPlayerId === action.playerId) {
        return { code: "INVALID_TARGET", message: "Cannot target yourself" };
      }
      const target = findPlayer(state, action.targetPlayerId);
      if (!target)
        return { code: "UNKNOWN_PLAYER", message: `No such player ${action.targetPlayerId}` };
      if (target.commodities[action.commodity] < 1) {
        return {
          code: "NOTHING_TO_STEAL",
          message: `${action.targetPlayerId} has no ${action.commodity}`,
        };
      }
      return null;
    }
    case "sabotage": {
      if (action.targetPlayerId === action.playerId) {
        return { code: "INVALID_TARGET", message: "Cannot target yourself" };
      }
      const knight = state.knights.get(action.targetVertex.id);
      if (!knight || knight.playerId !== action.targetPlayerId || !knight.active) {
        return {
          code: "NOT_AN_ACTIVE_KNIGHT",
          message: `${action.targetPlayerId} has no active knight at ${action.targetVertex.id}`,
        };
      }
      return null;
    }
    case "blueprint": {
      if (action.edges.length < 1 || action.edges.length > 2) {
        return { code: "INVALID_EDGE_COUNT", message: "Blueprint builds 1 or 2 free roads" };
      }
      if (action.edges.length > Math.min(2, player.pieces.roads)) {
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
            message: `Edge ${edge.id} does not connect to ${action.playerId}'s network`,
          };
        }
        scratchRoads = new Map(scratchRoads);
        scratchRoads.set(edge.id, action.playerId);
      }
      return null;
    }
    case "breakthrough": {
      if (player.cityImprovements[action.track] >= 5) {
        return { code: "TRACK_MAXED", message: `${action.track} is already at the maximum level` };
      }
      const ownsCity = [...state.buildings.values()].some(
        (b) => b.playerId === action.playerId && b.type === "city",
      );
      if (!ownsCity) {
        return {
          code: "NO_CITY",
          message: `${action.playerId} must own a city to improve a track`,
        };
      }
      return null;
    }
    case "apprentice":
      return null;
  }
}

/** Assumes {@link validatePlayProgressCard} already passed. */
export function playProgressCard(state: GameState, action: PlayProgressCardAction): ApplySuccess {
  const player = findPlayer(state, action.playerId)!;
  const cardIndex = findCardIndex(player, action.card);
  const progressCardsAfterRemoval = withoutCardAt(player, cardIndex);
  const baseState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, progressCards: progressCardsAfterRemoval } : p,
    ),
  };
  const playedEvent: GameEvent = {
    type: "PROGRESS_CARD_PLAYED",
    playerId: action.playerId,
    card: action.card,
  };

  switch (action.card) {
    case "bazaar": {
      const players = baseState.players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              hand: addHands(subtractHands(p.hand, { [action.give]: 2 }), { [action.get]: 1 }),
            }
          : p,
      );
      const bank = addHands(subtractHands(baseState.bank, { [action.get]: 1 }), {
        [action.give]: 2,
      });
      return { state: { ...baseState, players, bank }, events: [playedEvent] };
    }
    case "toll_bridge": {
      let players = baseState.players;
      let bank = baseState.bank;
      for (const trade of action.trades) {
        players = players.map((p) =>
          p.id === action.playerId
            ? {
                ...p,
                hand: addHands(subtractHands(p.hand, { [trade.give]: 2 }), { [trade.get]: 1 }),
              }
            : p,
        );
        bank = addHands(subtractHands(bank, { [trade.get]: 1 }), { [trade.give]: 2 });
      }
      return { state: { ...baseState, players, bank }, events: [playedEvent] };
    }
    case "windfall": {
      let totalGiven = 0;
      let players = baseState.players.map((p) => {
        if (p.id === action.playerId || p.hand[action.resource] < 1) return p;
        totalGiven += 1;
        return { ...p, hand: subtractHands(p.hand, { [action.resource]: 1 }) };
      });
      players = players.map((p) =>
        p.id === action.playerId
          ? { ...p, hand: addHands(p.hand, { [action.resource]: totalGiven }) }
          : p,
      );
      return { state: { ...baseState, players }, events: [playedEvent] };
    }
    case "mobilize": {
      const knights = new Map(baseState.knights);
      for (const [vertexId, knight] of knights) {
        if (knight.playerId === action.playerId) knights.set(vertexId, { ...knight, active: true });
      }
      return { state: { ...baseState, knights }, events: [playedEvent] };
    }
    case "bribery": {
      const players = baseState.players.map((p) => {
        if (p.id === action.playerId) {
          return { ...p, commodities: addCommodities(p.commodities, { [action.commodity]: 1 }) };
        }
        if (p.id === action.targetPlayerId) {
          return {
            ...p,
            commodities: subtractCommodities(p.commodities, { [action.commodity]: 1 }),
          };
        }
        return p;
      });
      return { state: { ...baseState, players }, events: [playedEvent] };
    }
    case "sabotage": {
      const knights = new Map(baseState.knights);
      const knight = knights.get(action.targetVertex.id)!;
      knights.set(action.targetVertex.id, { ...knight, active: false });
      return {
        state: { ...baseState, knights },
        events: [
          playedEvent,
          {
            type: "KNIGHT_DEACTIVATED",
            playerId: action.targetPlayerId,
            vertex: action.targetVertex,
          },
        ],
      };
    }
    case "blueprint": {
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
      return { state: { ...baseState, roads, players }, events: [playedEvent] };
    }
    case "breakthrough": {
      const newLevel = player.cityImprovements[action.track] + 1;
      const players = baseState.players.map((p) =>
        p.id === action.playerId
          ? { ...p, cityImprovements: { ...p.cityImprovements, [action.track]: newLevel } }
          : p,
      );
      return {
        state: { ...baseState, players },
        events: [
          playedEvent,
          { type: "CITY_TRACK_IMPROVED", playerId: action.playerId, track: action.track, newLevel },
        ],
      };
    }
    case "apprentice": {
      const players = baseState.players.map((p) =>
        p.id === action.playerId ? { ...p, apprenticeCredit: true } : p,
      );
      return { state: { ...baseState, players }, events: [playedEvent] };
    }
  }
}
