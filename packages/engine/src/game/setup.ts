import { hexEquals, verticesOfEdge, type Edge, type Vertex } from "../coordinates.js";
import { generateBoard } from "../board/generate.js";
import type { PlayerId, RuleError } from "../types.js";
import { isEdgeOnBoard, isVertexOnBoard, satisfiesDistanceRule } from "./building.js";
import { DEV_CARD_DECK } from "./devCards.js";
import {
  addHands,
  emptyHand,
  handTotal,
  PIECE_LIMITS,
  STARTING_BANK,
  subtractHands,
} from "./resources.js";
import { createRng, normalizeSeed, shuffle } from "../rng.js";
import type { ApplySuccess, GameEvent, GameState, Player, SetupPhase } from "./types.js";

const DEFAULT_TARGET_VICTORY_POINTS = 10;
const MIN_TARGET_VICTORY_POINTS = 10;
const MAX_TARGET_VICTORY_POINTS = 14;

export interface CreateGameOptions {
  readonly playerIds: readonly PlayerId[];
  readonly seed: number | string;
  /** Defaults to `seed` — override to vary the board independently of turn RNG. */
  readonly boardSeed?: number | string;
  /** 10-14; defaults to 10. */
  readonly targetVictoryPoints?: number;
}

/**
 * Builds the initial game state: generates the board, seats players in the
 * given order, and starts the snake-draft setup phase. Throws on caller
 * errors (wrong player count, duplicate ids) — this is a factory, not an
 * in-game action, so there's no RuleError channel for it.
 */
export function createGame(options: CreateGameOptions): GameState {
  const { playerIds, seed } = options;
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error(`createGame requires 2-4 players, got ${String(playerIds.length)}`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("createGame requires unique player ids");
  }
  const targetVictoryPoints = options.targetVictoryPoints ?? DEFAULT_TARGET_VICTORY_POINTS;
  if (
    targetVictoryPoints < MIN_TARGET_VICTORY_POINTS ||
    targetVictoryPoints > MAX_TARGET_VICTORY_POINTS
  ) {
    throw new Error(
      `targetVictoryPoints must be between ${String(MIN_TARGET_VICTORY_POINTS)} and ${String(MAX_TARGET_VICTORY_POINTS)}, got ${String(targetVictoryPoints)}`,
    );
  }

  const board = generateBoard({ seed: options.boardSeed ?? seed });
  const desertTile = board.tiles.find((t) => t.terrain === "desert");
  if (!desertTile) {
    throw new Error("Generated board has no desert tile");
  }

  const players: Player[] = playerIds.map((id) => ({
    id,
    hand: emptyHand(),
    pieces: { ...PIECE_LIMITS },
    devCards: [],
    knightsPlayed: 0,
    devCardPlayedThisTurn: false,
  }));

  const order = [...playerIds, ...[...playerIds].reverse()];
  const gameRngSeed = typeof seed === "string" ? `${seed}:turns` : seed + 1;
  const devDeckRngSeed = typeof seed === "string" ? `${seed}:devdeck` : seed + 2;
  const devDeck = shuffle(DEV_CARD_DECK, createRng(devDeckRngSeed));

  const phase: SetupPhase = {
    name: "setup",
    order,
    step: 0,
    awaitingRoad: false,
    lastSettlementVertex: null,
  };

  return {
    board,
    players,
    bank: { ...STARTING_BANK },
    buildings: new Map(),
    roads: new Map(),
    robber: desertTile.hex,
    currentPlayerIndex: 0,
    phase,
    rngState: normalizeSeed(gameRngSeed),
    diceRoll: null,
    devDeck,
    tradeOffers: new Map(),
    nextTradeId: 0,
    turnNumber: 0,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    targetVictoryPoints,
  };
}

export function validatePlaceSettlement(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): RuleError | null {
  if (state.phase.name !== "setup") {
    return { code: "WRONG_PHASE", message: "Not in the setup phase" };
  }
  const phase = state.phase;
  if (phase.order[phase.step] !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn to place a settlement` };
  }
  if (phase.awaitingRoad) {
    return { code: "ROAD_EXPECTED", message: "A road must be placed before the next settlement" };
  }
  if (!isVertexOnBoard(state, vertex)) {
    return { code: "OUT_OF_BOUNDS", message: `Vertex ${vertex.id} is not on the board` };
  }
  if (state.buildings.has(vertex.id)) {
    return { code: "VERTEX_OCCUPIED", message: `Vertex ${vertex.id} already has a building` };
  }
  if (!satisfiesDistanceRule(state, vertex)) {
    return {
      code: "DISTANCE_RULE",
      message: `Vertex ${vertex.id} is within 1 edge of an existing building`,
    };
  }
  return null;
}

export function validatePlaceRoad(
  state: GameState,
  playerId: PlayerId,
  edge: Edge,
): RuleError | null {
  if (state.phase.name !== "setup") {
    return { code: "WRONG_PHASE", message: "Not in the setup phase" };
  }
  const phase = state.phase;
  if (phase.order[phase.step] !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn to place a road` };
  }
  if (!phase.awaitingRoad || !phase.lastSettlementVertex) {
    return { code: "SETTLEMENT_EXPECTED", message: "A settlement must be placed before a road" };
  }
  if (!isEdgeOnBoard(state, edge)) {
    return { code: "OUT_OF_BOUNDS", message: `Edge ${edge.id} is not on the board` };
  }
  if (state.roads.has(edge.id)) {
    return { code: "EDGE_OCCUPIED", message: `Edge ${edge.id} already has a road` };
  }
  const lastSettlementVertex = phase.lastSettlementVertex;
  const touchesLastSettlement = verticesOfEdge(edge).some((v) => v.id === lastSettlementVertex.id);
  if (!touchesLastSettlement) {
    return {
      code: "NOT_CONNECTED",
      message: `Edge ${edge.id} does not connect to the settlement just placed`,
    };
  }
  return null;
}

/** Assumes {@link validatePlaceSettlement} already passed. */
export function placeSettlement(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): ApplySuccess {
  const phase = state.phase as SetupPhase;
  const isSecondSettlement = phase.step >= state.players.length;

  const buildings = new Map(state.buildings);
  buildings.set(vertex.id, { playerId, type: "settlement" });

  let players = state.players.map((p) =>
    p.id === playerId
      ? { ...p, pieces: { ...p.pieces, settlements: p.pieces.settlements - 1 } }
      : p,
  );
  const events: GameEvent[] = [{ type: "SETTLEMENT_PLACED", playerId, vertex }];

  let bank = state.bank;
  if (isSecondSettlement) {
    const grant = emptyHand();
    for (const hex of vertex.hexes) {
      const tile = state.board.tiles.find((t) => hexEquals(t.hex, hex));
      if (tile && tile.terrain !== "desert") {
        grant[tile.terrain] += 1;
      }
    }
    if (handTotal(grant) > 0) {
      players = players.map((p) =>
        p.id === playerId ? { ...p, hand: addHands(p.hand, grant) } : p,
      );
      bank = subtractHands(bank, grant);
      events.push({ type: "STARTING_RESOURCES_GRANTED", playerId, resources: grant });
    }
  }

  const newPhase: SetupPhase = { ...phase, awaitingRoad: true, lastSettlementVertex: vertex };

  return { state: { ...state, buildings, players, bank, phase: newPhase }, events };
}

/** Assumes {@link validatePlaceRoad} already passed. */
export function placeRoad(state: GameState, playerId: PlayerId, edge: Edge): ApplySuccess {
  const phase = state.phase as SetupPhase;

  const roads = new Map(state.roads);
  roads.set(edge.id, playerId);
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, pieces: { ...p.pieces, roads: p.pieces.roads - 1 } } : p,
  );

  const events: GameEvent[] = [{ type: "ROAD_PLACED", playerId, edge }];
  const nextStep = phase.step + 1;

  if (nextStep >= phase.order.length) {
    const firstPlayerId = phase.order[0]!;
    const currentPlayerIndex = state.players.findIndex((p) => p.id === firstPlayerId);
    events.push({ type: "SETUP_COMPLETED" }, { type: "TURN_STARTED", playerId: firstPlayerId });
    return {
      state: { ...state, roads, players, currentPlayerIndex, phase: { name: "roll" } },
      events,
    };
  }

  const nextPlayerId = phase.order[nextStep]!;
  const currentPlayerIndex = state.players.findIndex((p) => p.id === nextPlayerId);
  const newPhase: SetupPhase = {
    ...phase,
    step: nextStep,
    awaitingRoad: false,
    lastSettlementVertex: null,
  };
  return { state: { ...state, roads, players, currentPlayerIndex, phase: newPhase }, events };
}
