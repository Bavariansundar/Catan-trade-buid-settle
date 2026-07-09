import { hexEquals, verticesOfEdge, type Edge, type Vertex } from "../coordinates.js";
import type { PlayerId, RuleError } from "../types.js";
import { isEdgeOnBoard, isVertexOnBoard, satisfiesDistanceRule } from "./building.js";
import { resolveBoardGenerator, resolveConfig, type RuleModule } from "./module.js";
import { addHands, emptyCommodityHand, emptyHand, handTotal, subtractHands } from "./resources.js";
import { createRng, normalizeSeed, shuffle } from "../rng.js";
import type { ApplySuccess, GameEvent, GameState, Player, SetupPhase } from "./types.js";

export interface CreateGameOptions {
  readonly playerIds: readonly PlayerId[];
  readonly seed: number | string;
  /** Defaults to `seed` — override to vary the board independently of turn RNG. */
  readonly boardSeed?: number | string;
  /** Must fall within the resolved config's targetVictoryPointsRange; defaults to its minimum. */
  readonly targetVictoryPoints?: number;
}

/**
 * Builds the initial game state: resolves `modules`' combined config and
 * board spec, generates the board, seats players in the given order, and
 * starts the snake-draft setup phase. Throws on caller errors (wrong player
 * count, duplicate ids) — this is a factory, not an in-game action, so
 * there's no RuleError channel for it.
 */
export function createGame(modules: readonly RuleModule[], options: CreateGameOptions): GameState {
  const { playerIds, seed } = options;
  const config = resolveConfig(modules);
  const [minPlayers, maxPlayers] = config.playerCountRange;
  if (playerIds.length < minPlayers || playerIds.length > maxPlayers) {
    throw new Error(
      `createGame requires ${String(minPlayers)}-${String(maxPlayers)} players, got ${String(playerIds.length)}`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("createGame requires unique player ids");
  }
  const [minTargetVp, maxTargetVp] = config.targetVictoryPointsRange;
  const targetVictoryPoints = options.targetVictoryPoints ?? minTargetVp;
  if (targetVictoryPoints < minTargetVp || targetVictoryPoints > maxTargetVp) {
    throw new Error(
      `targetVictoryPoints must be between ${String(minTargetVp)} and ${String(maxTargetVp)}, got ${String(targetVictoryPoints)}`,
    );
  }

  const board = resolveBoardGenerator(modules)({ seed: options.boardSeed ?? seed });
  const desertTile = board.tiles.find((t) => t.terrain === "desert");
  if (!desertTile) {
    throw new Error("Generated board has no desert tile");
  }

  const players: Player[] = playerIds.map((id) => ({
    id,
    hand: emptyHand(),
    pieces: { ...config.pieceLimits },
    devCards: [],
    knightsPlayed: 0,
    devCardPlayedThisTurn: false,
    shipMovedThisTurn: false,
    commodities: emptyCommodityHand(),
    cityImprovements: { trade: 0, politics: 0, science: 0 },
    progressCards: [],
    landmarks: [],
    apprenticeCredit: false,
    barbarianDefenseWins: 0,
  }));

  const order = [...playerIds, ...[...playerIds].reverse()];
  const gameRngSeed = typeof seed === "string" ? `${seed}:turns` : seed + 1;
  const devDeckRngSeed = typeof seed === "string" ? `${seed}:devdeck` : seed + 2;
  const devDeck = shuffle(config.devCardDeck, createRng(devDeckRngSeed));

  const phase: SetupPhase = {
    name: "setup",
    order,
    step: 0,
    awaitingRoad: false,
    lastSettlementVertex: null,
  };

  let state: GameState = {
    board,
    players,
    bank: { ...config.startingBank },
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
    ships: new Map(),
    pirateHex: null,
    hiddenHexes: new Map(),
    discoveryBag: [],
    islandBonusAwarded: new Map(),
    homeIslandHexes: [],
    commodityBank: emptyCommodityHand(),
    knights: new Map(),
    cityWalls: new Set(),
    barbarianTrackPosition: 0,
    metropolises: new Map(),
    tradeDeck: [],
    politicsDeck: [],
    scienceDeck: [],
    eventRoll: null,
    deferredBarbarianTribute: null,
  };

  for (const module of modules) {
    state = module.initGameState?.(state) ?? state;
  }

  return state;
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
