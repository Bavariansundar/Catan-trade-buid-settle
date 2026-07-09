import type { PlayerId, RuleError } from "../types.js";
import { canAffordCommodity, subtractCommodities, trackUpgradeCost } from "./resources.js";
import type { ApplySuccess, GameState, ImproveCityTrackAction, Player, Track } from "./types.js";

const MAX_TRACK_LEVEL = 5;

const COMMODITY_FOR_TRACK: Record<Track, "cloth" | "coin" | "paper"> = {
  trade: "cloth",
  politics: "coin",
  science: "paper",
};

function findPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function ownsAnyCity(state: GameState, playerId: PlayerId): boolean {
  return [...state.buildings.values()].some((b) => b.playerId === playerId && b.type === "city");
}

/** Cost (in the track's commodity) for `playerId`'s next `IMPROVE_CITY_TRACK` on `track`, after any banked Apprentice discount. */
export function nextTrackUpgradeCost(state: GameState, player: Player, track: Track): number {
  const base = trackUpgradeCost(player.cityImprovements[track]);
  return player.apprenticeCredit ? Math.max(1, base - 1) : base;
}

export function validateImproveCityTrack(
  state: GameState,
  action: ImproveCityTrackAction,
): RuleError | null {
  const player = findPlayer(state, action.playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${action.playerId}` };
  if (player.cityImprovements[action.track] >= MAX_TRACK_LEVEL) {
    return { code: "TRACK_MAXED", message: `${action.track} is already at the maximum level` };
  }
  if (!ownsAnyCity(state, action.playerId)) {
    return { code: "NO_CITY", message: `${action.playerId} must own a city to improve a track` };
  }
  const commodity = COMMODITY_FOR_TRACK[action.track];
  const cost = nextTrackUpgradeCost(state, player, action.track);
  if (!canAffordCommodity(player.commodities, { [commodity]: cost })) {
    return {
      code: "CANNOT_AFFORD",
      message: `${action.playerId} cannot afford to improve ${action.track}`,
    };
  }
  return null;
}

/** Assumes {@link validateImproveCityTrack} already passed. */
export function improveCityTrack(state: GameState, action: ImproveCityTrackAction): ApplySuccess {
  const player = findPlayer(state, action.playerId)!;
  const commodity = COMMODITY_FOR_TRACK[action.track];
  const cost = nextTrackUpgradeCost(state, player, action.track);
  const newLevel = player.cityImprovements[action.track] + 1;

  const players = state.players.map((p) =>
    p.id === action.playerId
      ? {
          ...p,
          commodities: subtractCommodities(p.commodities, { [commodity]: cost }),
          cityImprovements: { ...p.cityImprovements, [action.track]: newLevel },
          apprenticeCredit: false,
        }
      : p,
  );
  const commodityBank = {
    ...state.commodityBank,
    [commodity]: state.commodityBank[commodity] + cost,
  };

  return {
    state: { ...state, players, commodityBank },
    events: [
      { type: "CITY_TRACK_IMPROVED", playerId: action.playerId, track: action.track, newLevel },
    ],
  };
}

/** True if `playerId` is the strict sole leader of `track` (level >= threshold, no ties). */
export function isSoleTrackLeader(
  state: GameState,
  playerId: PlayerId,
  track: Track,
  minLevel: number,
): boolean {
  const player = findPlayer(state, playerId);
  if (!player || player.cityImprovements[track] < minLevel) return false;
  return state.players.every(
    (p) => p.id === playerId || p.cityImprovements[track] < player.cityImprovements[track],
  );
}
