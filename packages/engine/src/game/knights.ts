import { edgesOfVertex, hexEquals, type Hex, type Vertex } from "../coordinates.js";
import type { PlayerId, RuleError } from "../types.js";
import { isVertexOnBoard } from "./building.js";
import {
  BUILD_COSTS,
  canAfford,
  canAffordCommodity,
  knightPromotionCost,
  subtractCommodities,
  subtractHands,
} from "./resources.js";
import type {
  ActivateKnightAction,
  ApplySuccess,
  BuyKnightAction,
  ChaseRobberAction,
  GameState,
  KnightLevel,
  MoveKnightAction,
  Player,
  PromoteKnightAction,
} from "./types.js";

const MAX_KNIGHT_LEVEL: KnightLevel = 3;
/** Minimum Politics track level required to promote a knight *to* this level. */
const POLITICS_LEVEL_REQUIRED: Record<2 | 3, number> = { 2: 2, 3: 4 };

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

/** A knight may sit on the player's own settlement/city, or any empty vertex reachable via their own road/ship network. */
export function hasKnightConnectivity(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): boolean {
  const building = state.buildings.get(vertex.id);
  if (building?.playerId === playerId) return true;
  for (const edge of edgesOfVertex(vertex)) {
    if (state.roads.get(edge.id) === playerId) return true;
    if (state.ships.get(edge.id) === playerId) return true;
  }
  return false;
}

export function validateBuyKnight(state: GameState, action: BuyKnightAction): RuleError | null {
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  if (!isVertexOnBoard(state, action.vertex)) {
    return { code: "OUT_OF_BOUNDS", message: `Vertex ${action.vertex.id} is not on the board` };
  }
  if (state.knights.has(action.vertex.id)) {
    return { code: "VERTEX_OCCUPIED", message: `Vertex ${action.vertex.id} already has a knight` };
  }
  if (!hasKnightConnectivity(state, action.playerId, action.vertex)) {
    return {
      code: "NOT_CONNECTED",
      message: `Vertex ${action.vertex.id} does not connect to ${action.playerId}'s network`,
    };
  }
  if (player.pieces.knights <= 0) {
    return { code: "NO_PIECES_LEFT", message: `${action.playerId} has no knights left to build` };
  }
  if (!canAfford(player.hand, BUILD_COSTS.knight)) {
    return { code: "CANNOT_AFFORD", message: `${action.playerId} cannot afford a knight` };
  }
  return null;
}

/** Assumes {@link validateBuyKnight} already passed. */
export function buyKnight(state: GameState, action: BuyKnightAction): ApplySuccess {
  const knights = new Map(state.knights);
  knights.set(action.vertex.id, { playerId: action.playerId, level: 1, active: false });
  const players = state.players.map((p) =>
    p.id === action.playerId
      ? {
          ...p,
          hand: subtractHands(p.hand, BUILD_COSTS.knight),
          pieces: { ...p.pieces, knights: p.pieces.knights - 1 },
        }
      : p,
  );
  return {
    state: { ...state, knights, players },
    events: [{ type: "KNIGHT_BOUGHT", playerId: action.playerId, vertex: action.vertex }],
  };
}

export function validateActivateKnight(
  state: GameState,
  action: ActivateKnightAction,
): RuleError | null {
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  const knight = state.knights.get(action.vertex.id);
  if (!knight || knight.playerId !== action.playerId) {
    return {
      code: "NOT_YOUR_KNIGHT",
      message: `${action.playerId} has no knight at ${action.vertex.id}`,
    };
  }
  if (knight.active) {
    return { code: "ALREADY_ACTIVE", message: `Knight at ${action.vertex.id} is already active` };
  }
  if (player.hand.wheat < 1) {
    return {
      code: "CANNOT_AFFORD",
      message: `${action.playerId} needs 1 wheat to activate a knight`,
    };
  }
  return null;
}

/** Assumes {@link validateActivateKnight} already passed. */
export function activateKnight(state: GameState, action: ActivateKnightAction): ApplySuccess {
  const knights = new Map(state.knights);
  const knight = knights.get(action.vertex.id)!;
  knights.set(action.vertex.id, { ...knight, active: true });
  const players = state.players.map((p) =>
    p.id === action.playerId ? { ...p, hand: subtractHands(p.hand, { wheat: 1 }) } : p,
  );
  return {
    state: { ...state, knights, players },
    events: [{ type: "KNIGHT_ACTIVATED", playerId: action.playerId, vertex: action.vertex }],
  };
}

export function validatePromoteKnight(
  state: GameState,
  action: PromoteKnightAction,
): RuleError | null {
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  const knight = state.knights.get(action.vertex.id);
  if (!knight || knight.playerId !== action.playerId) {
    return {
      code: "NOT_YOUR_KNIGHT",
      message: `${action.playerId} has no knight at ${action.vertex.id}`,
    };
  }
  if (knight.level >= MAX_KNIGHT_LEVEL) {
    return { code: "KNIGHT_MAXED", message: `Knight at ${action.vertex.id} is already Mighty` };
  }
  const targetLevel = (knight.level + 1) as 2 | 3;
  if (player.cityImprovements.politics < POLITICS_LEVEL_REQUIRED[targetLevel]) {
    return {
      code: "POLITICS_TOO_LOW",
      message: `${action.playerId}'s Politics track is too low to promote to level ${String(targetLevel)}`,
    };
  }
  const cost = knightPromotionCost(knight.level);
  if (!canAffordCommodity(player.commodities, { coin: cost })) {
    return {
      code: "CANNOT_AFFORD",
      message: `${action.playerId} cannot afford to promote this knight`,
    };
  }
  return null;
}

/** Assumes {@link validatePromoteKnight} already passed. */
export function promoteKnight(state: GameState, action: PromoteKnightAction): ApplySuccess {
  const knight = state.knights.get(action.vertex.id)!;
  const newLevel = (knight.level + 1) as KnightLevel;
  const cost = knightPromotionCost(knight.level);

  const knights = new Map(state.knights);
  knights.set(action.vertex.id, { ...knight, level: newLevel });
  const players = state.players.map((p) =>
    p.id === action.playerId
      ? { ...p, commodities: subtractCommodities(p.commodities, { coin: cost }) }
      : p,
  );
  return {
    state: { ...state, knights, players },
    events: [
      { type: "KNIGHT_PROMOTED", playerId: action.playerId, vertex: action.vertex, newLevel },
    ],
  };
}

export function validateMoveKnight(state: GameState, action: MoveKnightAction): RuleError | null {
  const knight = state.knights.get(action.fromVertex.id);
  if (!knight || knight.playerId !== action.playerId) {
    return {
      code: "NOT_YOUR_KNIGHT",
      message: `${action.playerId} has no knight at ${action.fromVertex.id}`,
    };
  }
  if (!isVertexOnBoard(state, action.toVertex)) {
    return { code: "OUT_OF_BOUNDS", message: `Vertex ${action.toVertex.id} is not on the board` };
  }
  if (action.toVertex.id === action.fromVertex.id) {
    return { code: "SAME_VERTEX", message: "A knight must move to a different vertex" };
  }
  if (state.knights.has(action.toVertex.id)) {
    return {
      code: "VERTEX_OCCUPIED",
      message: `Vertex ${action.toVertex.id} already has a knight`,
    };
  }
  if (!hasKnightConnectivity(state, action.playerId, action.toVertex)) {
    return {
      code: "NOT_CONNECTED",
      message: `Vertex ${action.toVertex.id} does not connect to ${action.playerId}'s network`,
    };
  }
  return null;
}

/** Assumes {@link validateMoveKnight} already passed. */
export function moveKnight(state: GameState, action: MoveKnightAction): ApplySuccess {
  const knight = state.knights.get(action.fromVertex.id)!;
  const knights = new Map(state.knights);
  knights.delete(action.fromVertex.id);
  knights.set(action.toVertex.id, knight);
  return {
    state: { ...state, knights },
    events: [
      {
        type: "KNIGHT_MOVED",
        playerId: action.playerId,
        fromVertex: action.fromVertex,
        toVertex: action.toVertex,
      },
    ],
  };
}

export function validateChaseRobber(state: GameState, action: ChaseRobberAction): RuleError | null {
  const knight = state.knights.get(action.knightVertex.id);
  if (!knight || knight.playerId !== action.playerId || !knight.active) {
    return {
      code: "NOT_AN_ACTIVE_KNIGHT",
      message: `${action.playerId} has no active knight at ${action.knightVertex.id}`,
    };
  }
  if (!action.knightVertex.hexes.some((h) => hexEquals(h, state.robber))) {
    return {
      code: "NOT_ADJACENT",
      message: `Knight at ${action.knightVertex.id} is not adjacent to the robber`,
    };
  }
  const onBoard = state.board.tiles.some((t) => hexEquals(t.hex, action.toHex));
  if (!onBoard) {
    return { code: "OUT_OF_BOUNDS", message: `Hex is not on the board` };
  }
  if (hexEquals(action.toHex, state.robber)) {
    return { code: "ROBBER_MUST_MOVE", message: "The robber must move to a new hex" };
  }
  return null;
}

/** Assumes {@link validateChaseRobber} already passed. Displaces the robber without stealing, deactivating the knight used. */
export function chaseRobber(state: GameState, action: ChaseRobberAction): ApplySuccess {
  const knights = new Map(state.knights);
  const knight = knights.get(action.knightVertex.id)!;
  knights.set(action.knightVertex.id, { ...knight, active: false });
  const fromHex: Hex = state.robber;
  return {
    state: { ...state, knights, robber: action.toHex },
    events: [
      { type: "ROBBER_CHASED", playerId: action.playerId, fromHex, toHex: action.toHex },
      { type: "KNIGHT_DEACTIVATED", playerId: action.playerId, vertex: action.knightVertex },
    ],
  };
}
