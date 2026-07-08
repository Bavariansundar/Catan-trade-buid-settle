import {
  edgesOfVertex,
  hexKey,
  neighborVertices,
  verticesOfEdge,
  type Edge,
  type Vertex,
} from "../coordinates.js";
import type { PlayerId, RuleError } from "../types.js";
import { BUILD_COSTS, canAfford, subtractHands, addHands } from "./resources.js";
import type { GameState, Player } from "./types.js";

export function isVertexOnBoard(state: GameState, vertex: Vertex): boolean {
  const boardHexes = new Set(state.board.tiles.map((t) => hexKey(t.hex)));
  return vertex.hexes.some((h) => boardHexes.has(hexKey(h)));
}

export function isEdgeOnBoard(state: GameState, edge: Edge): boolean {
  const boardHexes = new Set(state.board.tiles.map((t) => hexKey(t.hex)));
  return edge.hexes.some((h) => boardHexes.has(hexKey(h)));
}

/** True if none of `vertex`'s neighbor vertices carries a building (the "2+ edge distance" rule). */
export function satisfiesDistanceRule(state: GameState, vertex: Vertex): boolean {
  return neighborVertices(vertex).every((n) => !state.buildings.has(n.id));
}

/**
 * True if `playerId` already has a road or building reaching one of `edge`'s
 * endpoints — either directly (a building on the endpoint) or via one of
 * their existing roads incident to that endpoint. Matches the base-game
 * rule that a road may be built through/around a vertex regardless of
 * which player (if any) holds the settlement there; only the *longest
 * road* calculation (Phase 3) is interrupted by an opponent's settlement.
 */
export function hasRoadConnectivity(state: GameState, playerId: PlayerId, edge: Edge): boolean {
  for (const vertex of verticesOfEdge(edge)) {
    const building = state.buildings.get(vertex.id);
    if (building?.playerId === playerId) return true;
    for (const incidentEdge of edgesOfVertex(vertex)) {
      if (incidentEdge.id === edge.id) continue;
      if (state.roads.get(incidentEdge.id) === playerId) return true;
    }
  }
  return false;
}

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function validateBuildRoad(
  state: GameState,
  playerId: PlayerId,
  edge: Edge,
): RuleError | null {
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
  if (!isEdgeOnBoard(state, edge)) {
    return { code: "OUT_OF_BOUNDS", message: `Edge ${edge.id} is not on the board` };
  }
  if (state.roads.has(edge.id)) {
    return { code: "EDGE_OCCUPIED", message: `Edge ${edge.id} already has a road` };
  }
  if (!hasRoadConnectivity(state, playerId, edge)) {
    return {
      code: "NOT_CONNECTED",
      message: `Edge ${edge.id} does not connect to ${playerId}'s road network`,
    };
  }
  if (player.pieces.roads <= 0) {
    return { code: "NO_PIECES_LEFT", message: `${playerId} has no roads left to build` };
  }
  if (!canAfford(player.hand, BUILD_COSTS.road)) {
    return { code: "CANNOT_AFFORD", message: `${playerId} cannot afford a road` };
  }
  return null;
}

export function validateBuildSettlement(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): RuleError | null {
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
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
  const connectedByOwnRoad = edgesOfVertex(vertex).some(
    (edge) => state.roads.get(edge.id) === playerId,
  );
  if (!connectedByOwnRoad) {
    return {
      code: "NOT_CONNECTED",
      message: `Vertex ${vertex.id} does not connect to ${playerId}'s road network`,
    };
  }
  if (player.pieces.settlements <= 0) {
    return { code: "NO_PIECES_LEFT", message: `${playerId} has no settlements left to build` };
  }
  if (!canAfford(player.hand, BUILD_COSTS.settlement)) {
    return { code: "CANNOT_AFFORD", message: `${playerId} cannot afford a settlement` };
  }
  return null;
}

export function validateBuildCity(
  state: GameState,
  playerId: PlayerId,
  vertex: Vertex,
): RuleError | null {
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
  const building = state.buildings.get(vertex.id);
  if (!building || building.playerId !== playerId || building.type !== "settlement") {
    return {
      code: "NO_SETTLEMENT_TO_UPGRADE",
      message: `${playerId} has no settlement at ${vertex.id} to upgrade`,
    };
  }
  if (player.pieces.cities <= 0) {
    return { code: "NO_PIECES_LEFT", message: `${playerId} has no cities left to build` };
  }
  if (!canAfford(player.hand, BUILD_COSTS.city)) {
    return { code: "CANNOT_AFFORD", message: `${playerId} cannot afford a city` };
  }
  return null;
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: (player: Player) => Player,
): readonly Player[] {
  return state.players.map((p) => (p.id === playerId ? update(p) : p));
}

/** Assumes {@link validateBuildRoad} already passed. */
export function buildRoad(state: GameState, playerId: PlayerId, edge: Edge): GameState {
  const roads = new Map(state.roads);
  roads.set(edge.id, playerId);
  return {
    ...state,
    roads,
    bank: addHands(state.bank, BUILD_COSTS.road),
    players: updatePlayer(state, playerId, (p) => ({
      ...p,
      hand: subtractHands(p.hand, BUILD_COSTS.road),
      pieces: { ...p.pieces, roads: p.pieces.roads - 1 },
    })),
  };
}

/** Assumes {@link validateBuildSettlement} already passed. */
export function buildSettlement(state: GameState, playerId: PlayerId, vertex: Vertex): GameState {
  const buildings = new Map(state.buildings);
  buildings.set(vertex.id, { playerId, type: "settlement" });
  return {
    ...state,
    buildings,
    bank: addHands(state.bank, BUILD_COSTS.settlement),
    players: updatePlayer(state, playerId, (p) => ({
      ...p,
      hand: subtractHands(p.hand, BUILD_COSTS.settlement),
      pieces: { ...p.pieces, settlements: p.pieces.settlements - 1 },
    })),
  };
}

/** Assumes {@link validateBuildCity} already passed. */
export function buildCity(state: GameState, playerId: PlayerId, vertex: Vertex): GameState {
  const buildings = new Map(state.buildings);
  buildings.set(vertex.id, { playerId, type: "city" });
  return {
    ...state,
    buildings,
    bank: addHands(state.bank, BUILD_COSTS.city),
    players: updatePlayer(state, playerId, (p) => ({
      ...p,
      hand: subtractHands(p.hand, BUILD_COSTS.city),
      pieces: { ...p.pieces, cities: p.pieces.cities - 1, settlements: p.pieces.settlements + 1 },
    })),
  };
}
