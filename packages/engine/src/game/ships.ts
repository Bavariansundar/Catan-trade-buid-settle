import { edgesOfVertex, hexKey, verticesOfEdge, type Edge } from "../coordinates.js";
import type { PlayerId, RuleError } from "../types.js";
import { BUILD_COSTS, canAfford, addHands, subtractHands } from "./resources.js";
import type { GameState, Player } from "./types.js";

function seaHexKeys(state: GameState): Set<string> {
  return new Set((state.board.seaHexes ?? []).map(hexKey));
}

function playAreaHexKeys(state: GameState): Set<string> {
  const keys = seaHexKeys(state);
  for (const tile of state.board.tiles) keys.add(hexKey(tile.hex));
  return keys;
}

/** True if `edge` touches at least one hex in the scenario's play area (land or sea). */
export function isEdgeInPlayArea(state: GameState, edge: Edge): boolean {
  const known = playAreaHexKeys(state);
  return edge.hexes.some((h) => known.has(hexKey(h)));
}

/** A *sea edge* (ship-eligible): touches at least one sea hex — see docs/rules/seafarers-style.md §1. */
export function isSeaEdge(state: GameState, edge: Edge): boolean {
  const sea = seaHexKeys(state);
  return edge.hexes.some((h) => sea.has(hexKey(h)));
}

/** A *land edge* (road-eligible): touches no sea hex. */
export function isLandEdge(state: GameState, edge: Edge): boolean {
  return !isSeaEdge(state, edge);
}

/** True if the pirate blocks `edge` (one of the edge's own 2 hexes is the pirate's hex). */
export function isBlockedByPirate(state: GameState, edge: Edge): boolean {
  if (!state.pirateHex) return false;
  const pirateKey = hexKey(state.pirateHex);
  return edge.hexes.some((h) => hexKey(h) === pirateKey);
}

/**
 * True if `playerId` has a ship or building reaching one of `edge`'s
 * endpoints. Deliberately does NOT count a bare road endpoint — switching
 * from road to ship (or the reverse) requires an actual settlement/city at
 * the junction, per docs/rules/seafarers-style.md §6.
 */
export function hasShipConnectivity(
  state: GameState,
  playerId: PlayerId,
  edge: Edge,
  { ignoreEdgeId }: { ignoreEdgeId?: string } = {},
): boolean {
  for (const vertex of verticesOfEdge(edge)) {
    const building = state.buildings.get(vertex.id);
    if (building?.playerId === playerId) return true;
    for (const incidentEdge of edgesOfVertex(vertex)) {
      if (incidentEdge.id === edge.id) continue;
      if (incidentEdge.id === ignoreEdgeId) continue;
      if (state.ships.get(incidentEdge.id) === playerId) return true;
    }
  }
  return false;
}

/**
 * True if `edge` (one of `playerId`'s own ships) is *open*: movable per the
 * once-per-turn relocation rule. Not open if it's adjacent to the player's
 * own settlement/city at either endpoint, or if it's connected to another
 * of the player's ships/roads at *both* endpoints (load-bearing, not a
 * loose end).
 */
export function isOpenShip(state: GameState, playerId: PlayerId, edge: Edge): boolean {
  const [v1, v2] = verticesOfEdge(edge);
  for (const vertex of [v1, v2]) {
    if (state.buildings.get(vertex.id)?.playerId === playerId) return false;
  }
  const connectedAtBothEnds = [v1, v2].every((vertex) =>
    edgesOfVertex(vertex).some(
      (e) =>
        e.id !== edge.id &&
        (state.ships.get(e.id) === playerId || state.roads.get(e.id) === playerId),
    ),
  );
  return !connectedAtBothEnds;
}

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: (player: Player) => Player,
): readonly Player[] {
  return state.players.map((p) => (p.id === playerId ? update(p) : p));
}

export function validateBuildShip(
  state: GameState,
  playerId: PlayerId,
  edge: Edge,
): RuleError | null {
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
  if (!isEdgeInPlayArea(state, edge)) {
    return { code: "OUT_OF_BOUNDS", message: `Edge ${edge.id} is not on the board` };
  }
  if (!isSeaEdge(state, edge)) {
    return { code: "NOT_A_SEA_EDGE", message: `Edge ${edge.id} is not a sea edge` };
  }
  if (state.ships.has(edge.id)) {
    return { code: "EDGE_OCCUPIED", message: `Edge ${edge.id} already has a ship` };
  }
  if (isBlockedByPirate(state, edge)) {
    return { code: "BLOCKED_BY_PIRATE", message: `Edge ${edge.id} is adjacent to the pirate` };
  }
  if (!hasShipConnectivity(state, playerId, edge)) {
    return {
      code: "NOT_CONNECTED",
      message: `Edge ${edge.id} does not connect to ${playerId}'s network`,
    };
  }
  if (player.pieces.ships <= 0) {
    return { code: "NO_PIECES_LEFT", message: `${playerId} has no ships left to build` };
  }
  if (!canAfford(player.hand, BUILD_COSTS.ship)) {
    return { code: "CANNOT_AFFORD", message: `${playerId} cannot afford a ship` };
  }
  return null;
}

/** Assumes {@link validateBuildShip} already passed. */
export function buildShip(state: GameState, playerId: PlayerId, edge: Edge): GameState {
  const ships = new Map(state.ships);
  ships.set(edge.id, playerId);
  return {
    ...state,
    ships,
    bank: addHands(state.bank, BUILD_COSTS.ship),
    players: updatePlayer(state, playerId, (p) => ({
      ...p,
      hand: subtractHands(p.hand, BUILD_COSTS.ship),
      pieces: { ...p.pieces, ships: p.pieces.ships - 1 },
    })),
  };
}

export function validateMoveShip(
  state: GameState,
  playerId: PlayerId,
  fromEdge: Edge,
  toEdge: Edge,
): RuleError | null {
  const player = findPlayer(state, playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };
  if (player.shipMovedThisTurn) {
    return { code: "ALREADY_MOVED", message: `${playerId} already moved a ship this turn` };
  }
  if (state.ships.get(fromEdge.id) !== playerId) {
    return { code: "NOT_YOUR_SHIP", message: `${playerId} has no ship at ${fromEdge.id}` };
  }
  if (!isOpenShip(state, playerId, fromEdge)) {
    return { code: "SHIP_NOT_OPEN", message: `Ship at ${fromEdge.id} is not open to move` };
  }
  if (!isEdgeInPlayArea(state, toEdge)) {
    return { code: "OUT_OF_BOUNDS", message: `Edge ${toEdge.id} is not on the board` };
  }
  if (!isSeaEdge(state, toEdge)) {
    return { code: "NOT_A_SEA_EDGE", message: `Edge ${toEdge.id} is not a sea edge` };
  }
  if (toEdge.id === fromEdge.id) {
    return { code: "SAME_EDGE", message: "A ship must move to a different edge" };
  }
  if (state.ships.has(toEdge.id)) {
    return { code: "EDGE_OCCUPIED", message: `Edge ${toEdge.id} already has a ship` };
  }
  if (isBlockedByPirate(state, toEdge)) {
    return { code: "BLOCKED_BY_PIRATE", message: `Edge ${toEdge.id} is adjacent to the pirate` };
  }
  if (!hasShipConnectivity(state, playerId, toEdge, { ignoreEdgeId: fromEdge.id })) {
    return {
      code: "NOT_CONNECTED",
      message: `Edge ${toEdge.id} does not connect to ${playerId}'s network`,
    };
  }
  return null;
}

/** Assumes {@link validateMoveShip} already passed. */
export function moveShip(
  state: GameState,
  playerId: PlayerId,
  fromEdge: Edge,
  toEdge: Edge,
): GameState {
  const ships = new Map(state.ships);
  ships.delete(fromEdge.id);
  ships.set(toEdge.id, playerId);
  return {
    ...state,
    ships,
    players: updatePlayer(state, playerId, (p) => ({ ...p, shipMovedThisTurn: true })),
  };
}
