import { verticesOfEdge } from "../coordinates.js";
import type { PlayerId, ResourceType, RuleError } from "../types.js";
import { addHands, canAfford, handTotal, subtractHands } from "./resources.js";
import type {
  AcceptTradeAction,
  ApplySuccess,
  CancelTradeAction,
  CounterTradeAction,
  GameEvent,
  GameState,
  Player,
  ProposeTradeAction,
  RejectTradeAction,
  TradeOffer,
} from "./types.js";

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function eligibleResponders(offer: TradeOffer, allPlayerIds: readonly PlayerId[]): PlayerId[] {
  const candidates = offer.targetPlayerIds ?? allPlayerIds.filter((id) => id !== offer.proposerId);
  return candidates.filter((id) => id !== offer.proposerId && !offer.rejectedBy.includes(id));
}

// --- Player-to-player trades --------------------------------------------

export function validateProposeTrade(
  state: GameState,
  action: ProposeTradeAction,
): RuleError | null {
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Can only propose a trade during the main phase" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== action.playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${action.playerId}'s turn` };
  }
  const proposer = findPlayer(state, action.playerId);
  if (!proposer) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };

  if (handTotal(action.offering) === 0 || handTotal(action.requesting) === 0) {
    return { code: "EMPTY_TRADE", message: "A trade must offer and request at least one card" };
  }
  if (!canAfford(proposer.hand, action.offering)) {
    return {
      code: "INSUFFICIENT_RESOURCES",
      message: `${action.playerId} does not have the offered cards`,
    };
  }
  if (action.targetPlayerIds) {
    if (action.targetPlayerIds.length === 0) {
      return { code: "INVALID_TARGETS", message: "targetPlayerIds must be non-empty if provided" };
    }
    for (const targetId of action.targetPlayerIds) {
      if (targetId === action.playerId) {
        return { code: "INVALID_TARGETS", message: "Cannot address a trade to yourself" };
      }
      if (!findPlayer(state, targetId)) {
        return { code: "UNKNOWN_PLAYER", message: `No such player ${targetId}` };
      }
    }
  }
  return null;
}

export function proposeTrade(state: GameState, action: ProposeTradeAction): ApplySuccess {
  const id = `trade-${String(state.nextTradeId)}`;
  const offer: TradeOffer = {
    id,
    proposerId: action.playerId,
    offering: action.offering,
    requesting: action.requesting,
    targetPlayerIds: action.targetPlayerIds,
    rejectedBy: [],
  };
  const tradeOffers = new Map(state.tradeOffers);
  tradeOffers.set(id, offer);
  return {
    state: { ...state, tradeOffers, nextTradeId: state.nextTradeId + 1 },
    events: [
      {
        type: "TRADE_PROPOSED",
        tradeId: id,
        proposerId: action.playerId,
        offering: action.offering,
        requesting: action.requesting,
        targetPlayerIds: action.targetPlayerIds,
      },
    ],
  };
}

function validateResponder(
  state: GameState,
  playerId: PlayerId,
  tradeId: string,
): { offer: TradeOffer } | RuleError {
  const offer = state.tradeOffers.get(tradeId);
  if (!offer) return { code: "UNKNOWN_TRADE", message: `No open trade offer ${tradeId}` };
  const eligible = eligibleResponders(
    offer,
    state.players.map((p) => p.id),
  );
  if (!eligible.includes(playerId)) {
    return { code: "NOT_ELIGIBLE", message: `${playerId} cannot respond to trade ${tradeId}` };
  }
  return { offer };
}

export function validateAcceptTrade(state: GameState, action: AcceptTradeAction): RuleError | null {
  const responder = validateResponder(state, action.playerId, action.tradeId);
  if ("code" in responder) return responder;
  const { offer } = responder;

  const proposer = findPlayer(state, offer.proposerId)!;
  const accepter = findPlayer(state, action.playerId)!;
  if (!canAfford(proposer.hand, offer.offering)) {
    return {
      code: "INSUFFICIENT_RESOURCES",
      message: `${offer.proposerId} no longer has the offered cards`,
    };
  }
  if (!canAfford(accepter.hand, offer.requesting)) {
    return {
      code: "INSUFFICIENT_RESOURCES",
      message: `${action.playerId} does not have the requested cards`,
    };
  }
  return null;
}

/** Assumes {@link validateAcceptTrade} already passed. */
export function acceptTrade(state: GameState, action: AcceptTradeAction): ApplySuccess {
  const offer = state.tradeOffers.get(action.tradeId)!;
  const players = state.players.map((p) => {
    if (p.id === offer.proposerId) {
      return { ...p, hand: addHands(subtractHands(p.hand, offer.offering), offer.requesting) };
    }
    if (p.id === action.playerId) {
      return { ...p, hand: addHands(subtractHands(p.hand, offer.requesting), offer.offering) };
    }
    return p;
  });
  const tradeOffers = new Map(state.tradeOffers);
  tradeOffers.delete(action.tradeId);
  return {
    state: { ...state, players, tradeOffers },
    events: [
      {
        type: "TRADE_ACCEPTED",
        tradeId: action.tradeId,
        proposerId: offer.proposerId,
        accepterId: action.playerId,
      },
    ],
  };
}

export function validateRejectTrade(state: GameState, action: RejectTradeAction): RuleError | null {
  const responder = validateResponder(state, action.playerId, action.tradeId);
  return "code" in responder ? responder : null;
}

/** Assumes {@link validateRejectTrade} already passed. */
export function rejectTrade(state: GameState, action: RejectTradeAction): ApplySuccess {
  const offer = state.tradeOffers.get(action.tradeId)!;
  const updatedOffer: TradeOffer = { ...offer, rejectedBy: [...offer.rejectedBy, action.playerId] };
  const stillEligible = eligibleResponders(
    updatedOffer,
    state.players.map((p) => p.id),
  );

  const tradeOffers = new Map(state.tradeOffers);
  if (stillEligible.length === 0) {
    tradeOffers.delete(action.tradeId);
  } else {
    tradeOffers.set(action.tradeId, updatedOffer);
  }
  return {
    state: { ...state, tradeOffers },
    events: [{ type: "TRADE_REJECTED", tradeId: action.tradeId, playerId: action.playerId }],
  };
}

export function validateCounterTrade(
  state: GameState,
  action: CounterTradeAction,
): RuleError | null {
  const responder = validateResponder(state, action.playerId, action.tradeId);
  if ("code" in responder) return responder;
  if (handTotal(action.offering) === 0 || handTotal(action.requesting) === 0) {
    return { code: "EMPTY_TRADE", message: "A trade must offer and request at least one card" };
  }
  const counterer = findPlayer(state, action.playerId)!;
  if (!canAfford(counterer.hand, action.offering)) {
    return {
      code: "INSUFFICIENT_RESOURCES",
      message: `${action.playerId} does not have the offered cards`,
    };
  }
  return null;
}

/** Assumes {@link validateCounterTrade} already passed. */
export function counterTrade(state: GameState, action: CounterTradeAction): ApplySuccess {
  const original = state.tradeOffers.get(action.tradeId)!;
  const newId = `trade-${String(state.nextTradeId)}`;
  const newOffer: TradeOffer = {
    id: newId,
    proposerId: action.playerId,
    offering: action.offering,
    requesting: action.requesting,
    targetPlayerIds: [original.proposerId],
    rejectedBy: [],
  };
  const tradeOffers = new Map(state.tradeOffers);
  tradeOffers.delete(action.tradeId);
  tradeOffers.set(newId, newOffer);

  const events: GameEvent[] = [
    {
      type: "TRADE_COUNTERED",
      originalTradeId: action.tradeId,
      newTradeId: newId,
      playerId: action.playerId,
    },
  ];
  return { state: { ...state, tradeOffers, nextTradeId: state.nextTradeId + 1 }, events };
}

export function validateCancelTrade(state: GameState, action: CancelTradeAction): RuleError | null {
  const offer = state.tradeOffers.get(action.tradeId);
  if (!offer) return { code: "UNKNOWN_TRADE", message: `No open trade offer ${action.tradeId}` };
  if (offer.proposerId !== action.playerId) {
    return {
      code: "NOT_YOUR_TRADE",
      message: `${action.playerId} did not propose trade ${action.tradeId}`,
    };
  }
  return null;
}

/** Assumes {@link validateCancelTrade} already passed. */
export function cancelTrade(state: GameState, action: CancelTradeAction): ApplySuccess {
  const tradeOffers = new Map(state.tradeOffers);
  tradeOffers.delete(action.tradeId);
  return {
    state: { ...state, tradeOffers },
    events: [{ type: "TRADE_CANCELLED", tradeId: action.tradeId }],
  };
}

// --- Maritime (bank/port) trades -----------------------------------------

/** Best available ratio for trading away `resource`: 2 (specific port), 3 (generic port), or 4 (none). */
export function bestMaritimeRatio(
  state: GameState,
  playerId: PlayerId,
  resource: ResourceType,
): number {
  let best = 4;
  for (const harbor of state.board.harbors) {
    if (harbor.type !== "generic" && harbor.type !== resource) continue;
    const ratio = harbor.type === "generic" ? 3 : 2;
    if (ratio >= best) continue;
    const [v1, v2] = verticesOfEdge(harbor.edge);
    const ownsAccess =
      state.buildings.get(v1.id)?.playerId === playerId ||
      state.buildings.get(v2.id)?.playerId === playerId;
    if (ownsAccess) best = ratio;
  }
  return best;
}

export function validateMaritimeTrade(
  state: GameState,
  playerId: PlayerId,
  give: ResourceType,
  get: ResourceType,
): RuleError | null {
  if (state.phase.name !== "main") {
    return { code: "WRONG_PHASE", message: "Can only trade with the bank during the main phase" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn` };
  }
  if (give === get) {
    return { code: "SAME_RESOURCE", message: "Cannot trade a resource for itself" };
  }
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };

  const ratio = bestMaritimeRatio(state, playerId, give);
  if (player.hand[give] < ratio) {
    return {
      code: "INSUFFICIENT_RESOURCES",
      message: `${playerId} needs ${String(ratio)} ${give} for this trade`,
    };
  }
  if (state.bank[get] < 1) {
    return { code: "BANK_EMPTY", message: `The bank has no ${get} left` };
  }
  return null;
}

/** Assumes {@link validateMaritimeTrade} already passed. */
export function maritimeTrade(
  state: GameState,
  playerId: PlayerId,
  give: ResourceType,
  get: ResourceType,
): ApplySuccess {
  const ratio = bestMaritimeRatio(state, playerId, give);
  const players = state.players.map((p) =>
    p.id === playerId
      ? { ...p, hand: addHands(subtractHands(p.hand, { [give]: ratio }), { [get]: 1 }) }
      : p,
  );
  const bank = addHands(subtractHands(state.bank, { [get]: 1 }), { [give]: ratio });
  return {
    state: { ...state, players, bank },
    events: [
      { type: "MARITIME_TRADE_EXECUTED", playerId, gave: give, gaveAmount: ratio, got: get },
    ],
  };
}
