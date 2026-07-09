import { hexKey, type Hex } from "../coordinates.js";
import type { PlayerId } from "../types.js";
import { addHands } from "./resources.js";
import type { ApplySuccess, GameEvent, GameState } from "./types.js";

/**
 * Reveals any of `hexes` that are still face-down, drawing each from the
 * front of `discoveryBag` and granting the discoverer 1 free card of the
 * revealed terrain (nothing for a revealed desert) — see
 * docs/rules/seafarers-style.md §4. A no-op (returns `state` unchanged, no
 * events) if none of `hexes` are hidden, so callers can call this
 * unconditionally after any ship/settlement placement.
 */
export function revealHexesTouching(
  state: GameState,
  hexes: readonly Hex[],
  discovererId: PlayerId,
): ApplySuccess {
  const hiddenHexes = new Map(state.hiddenHexes);
  let discoveryBag = state.discoveryBag;
  let players = state.players;
  let tiles = state.board.tiles;
  const events: GameEvent[] = [];

  for (const hex of hexes) {
    const key = hexKey(hex);
    if (!hiddenHexes.has(key)) continue;

    const [drawn, ...restOfBag] = discoveryBag;
    if (!drawn) continue; // bag exhausted — nothing to reveal as (shouldn't happen with a correctly-sized scenario)
    discoveryBag = restOfBag;

    hiddenHexes.delete(key);
    tiles = [...tiles, { hex, terrain: drawn.terrain, number: drawn.number }];

    if (drawn.terrain !== "desert") {
      players = players.map((p) =>
        p.id === discovererId ? { ...p, hand: addHands(p.hand, { [drawn.terrain]: 1 }) } : p,
      );
    }

    events.push({
      type: "HEX_DISCOVERED",
      playerId: discovererId,
      hex,
      terrain: drawn.terrain,
      number: drawn.number,
    });
  }

  if (events.length === 0) return { state, events: [] };

  return {
    state: {
      ...state,
      hiddenHexes,
      discoveryBag,
      players,
      board: { ...state.board, tiles },
    },
    events,
  };
}
