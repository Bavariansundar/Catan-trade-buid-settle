import type { PlayerId, RuleError } from "../types.js";
import { BUILD_COSTS, canAfford, subtractHands } from "./resources.js";
import type { ApplySuccess, BuildCityWallAction, GameState, Player } from "./types.js";

const DISCARD_BONUS_PER_WALL = 2;

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function wallCount(state: GameState, playerId: PlayerId): number {
  let count = 0;
  for (const vertexId of state.cityWalls) {
    if (state.buildings.get(vertexId)?.playerId === playerId) count += 1;
  }
  return count;
}

/** `7 + 2` per city wall the player has built — see docs/rules/cities-knights-style.md §4. */
export function discardThreshold(state: GameState, playerId: PlayerId): number {
  return 7 + DISCARD_BONUS_PER_WALL * wallCount(state, playerId);
}

/** Cities & Knights-style replacement for `dice.ts`'s `pendingDiscards`, using each player's dynamic threshold. */
export function pendingDiscardsWithWalls(state: GameState): ReadonlyMap<PlayerId, number> {
  const pending = new Map<PlayerId, number>();
  for (const player of state.players) {
    const total =
      player.hand.wood +
      player.hand.wheat +
      player.hand.sheep +
      player.hand.brick +
      player.hand.ore;
    const threshold = discardThreshold(state, player.id);
    if (total > threshold) pending.set(player.id, Math.floor(total / 2));
  }
  return pending;
}

export function validateBuildCityWall(
  state: GameState,
  action: BuildCityWallAction,
): RuleError | null {
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  const building = state.buildings.get(action.vertex.id);
  if (!building || building.playerId !== action.playerId || building.type !== "city") {
    return {
      code: "NOT_YOUR_CITY",
      message: `${action.playerId} has no city at ${action.vertex.id}`,
    };
  }
  if (state.cityWalls.has(action.vertex.id)) {
    return { code: "ALREADY_WALLED", message: `${action.vertex.id} already has a city wall` };
  }
  if (player.pieces.cityWalls <= 0) {
    return {
      code: "NO_PIECES_LEFT",
      message: `${action.playerId} has no city walls left to build`,
    };
  }
  if (!canAfford(player.hand, BUILD_COSTS.cityWall)) {
    return { code: "CANNOT_AFFORD", message: `${action.playerId} cannot afford a city wall` };
  }
  return null;
}

/** Assumes {@link validateBuildCityWall} already passed. */
export function buildCityWall(state: GameState, action: BuildCityWallAction): ApplySuccess {
  const cityWalls = new Set(state.cityWalls);
  cityWalls.add(action.vertex.id);
  const players = state.players.map((p) =>
    p.id === action.playerId
      ? {
          ...p,
          hand: subtractHands(p.hand, BUILD_COSTS.cityWall),
          pieces: { ...p.pieces, cityWalls: p.pieces.cityWalls - 1 },
        }
      : p,
  );
  const bank = { ...state.bank };
  for (const resource of Object.keys(
    BUILD_COSTS.cityWall,
  ) as (keyof typeof BUILD_COSTS.cityWall)[]) {
    bank[resource] += BUILD_COSTS.cityWall[resource];
  }
  return {
    state: { ...state, cityWalls, players, bank },
    events: [{ type: "CITY_WALL_BUILT", playerId: action.playerId, vertex: action.vertex }],
  };
}
