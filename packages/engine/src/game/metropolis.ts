import type { PlayerId, RuleError } from "../types.js";
import { isSoleTrackLeader } from "./cityTracks.js";
import type { ApplySuccess, BuildMetropolisAction, GameEvent, GameState, Player } from "./types.js";

const METROPOLIS_MIN_TRACK_LEVEL = 4;

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function validateBuildMetropolis(
  state: GameState,
  action: BuildMetropolisAction,
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
  if (!isSoleTrackLeader(state, action.playerId, action.track, METROPOLIS_MIN_TRACK_LEVEL)) {
    return {
      code: "NOT_SOLE_LEADER",
      message: `${action.playerId} is not the sole leader of ${action.track}`,
    };
  }
  const current = state.metropolises.get(action.track);
  if (current?.playerId === action.playerId) {
    return {
      code: "ALREADY_HOLDER",
      message: `${action.playerId} already holds the ${action.track} metropolis`,
    };
  }
  return null;
}

/** Assumes {@link validateBuildMetropolis} already passed. Builds (or transfers) the metropolis for `action.track`. */
export function buildMetropolis(state: GameState, action: BuildMetropolisAction): ApplySuccess {
  const current = state.metropolises.get(action.track);
  const metropolises = new Map(state.metropolises);
  metropolises.set(action.track, { playerId: action.playerId, vertex: action.vertex.id });

  const events: GameEvent[] = current
    ? [
        {
          type: "METROPOLIS_TRANSFERRED",
          fromPlayerId: current.playerId,
          toPlayerId: action.playerId,
          track: action.track,
          vertex: action.vertex,
        },
      ]
    : [
        {
          type: "METROPOLIS_BUILT",
          playerId: action.playerId,
          vertex: action.vertex,
          track: action.track,
        },
      ];

  return { state: { ...state, metropolises }, events };
}
