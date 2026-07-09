import { edgesOfHex, hexEquals, hexKey, type Hex } from "../coordinates.js";
import { createRngFromState } from "../rng.js";
import type { PlayerId, ResourceType, RuleError } from "../types.js";
import { addHands, handTotal, RESOURCE_TYPES, subtractHands } from "./resources.js";
import type { ApplySuccess, GameEvent, GameState } from "./types.js";

/**
 * Players with a ship on one of `hex`'s 6 edges — the sea-going analog of
 * {@link import("./robber.js").eligibleStealTargets}, sourced from
 * `state.ships` instead of `state.buildings`.
 */
export function eligibleShipStealTargets(
  state: GameState,
  hex: Hex,
  actingPlayerId: PlayerId,
): PlayerId[] {
  const targets = new Set<PlayerId>();
  for (const edge of edgesOfHex(hex)) {
    const ownerId = state.ships.get(edge.id);
    if (!ownerId || ownerId === actingPlayerId) continue;
    const victim = state.players.find((p) => p.id === ownerId);
    if (victim && handTotal(victim.hand) > 0) targets.add(ownerId);
  }
  return [...targets];
}

/**
 * The pirate-move mechanics: must move to a new sea hex, and must steal
 * from an eligible adjacent ship owner if any exist. Does NOT check
 * phase/turn — {@link validateMovePirate} adds that on top, mirroring
 * `validateRobberMovementCore` in robber.ts.
 */
export function validatePirateMovementCore(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): RuleError | null {
  const seaHexes = state.board.seaHexes ?? [];
  const isSea = seaHexes.some((h) => hexEquals(h, hex));
  if (!isSea) {
    return { code: "NOT_A_SEA_HEX", message: `Hex ${hexKey(hex)} is not a sea hex` };
  }
  if (state.pirateHex && hexEquals(hex, state.pirateHex)) {
    return { code: "PIRATE_MUST_MOVE", message: "The pirate must move to a new hex" };
  }

  const eligible = eligibleShipStealTargets(state, hex, playerId);
  if (stealFromPlayerId === null) {
    if (eligible.length > 0) {
      return {
        code: "MUST_STEAL",
        message: "At least one adjacent ship owner can be stolen from and must be chosen",
      };
    }
    return null;
  }
  if (!eligible.includes(stealFromPlayerId)) {
    return {
      code: "INVALID_STEAL_TARGET",
      message: `${stealFromPlayerId} is not a valid steal target for hex ${hexKey(hex)}`,
    };
  }
  return null;
}

export function validateMovePirate(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): RuleError | null {
  if (state.phase.name !== "robber") {
    return { code: "WRONG_PHASE", message: "Not expecting a pirate move right now" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn to move the pirate` };
  }
  return validatePirateMovementCore(state, playerId, hex, stealFromPlayerId);
}

/** Assumes {@link validateMovePirate} (or the knight-card equivalent) already passed. */
export function applyPirateMovementCore(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): ApplySuccess {
  const events: GameEvent[] = [{ type: "PIRATE_MOVED", playerId, hex }];
  let players = state.players;
  let rngState = state.rngState;

  if (stealFromPlayerId !== null) {
    const victim = players.find((p) => p.id === stealFromPlayerId)!;
    const pool: ResourceType[] = RESOURCE_TYPES.flatMap((r) =>
      Array<ResourceType>(victim.hand[r]).fill(r),
    );
    const rng = createRngFromState(rngState);
    const stolen = pool[rng.int(0, pool.length)]!;
    rngState = rng.getState();

    players = players.map((p) => {
      if (p.id === stealFromPlayerId) return { ...p, hand: subtractHands(p.hand, { [stolen]: 1 }) };
      if (p.id === playerId) return { ...p, hand: addHands(p.hand, { [stolen]: 1 }) };
      return p;
    });
    events.push({
      type: "RESOURCE_STOLEN",
      thiefId: playerId,
      victimId: stealFromPlayerId,
      resource: stolen,
    });
  }

  return { state: { ...state, pirateHex: hex, players, rngState }, events };
}

/** Assumes {@link validateMovePirate} already passed. */
export function movePirate(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): ApplySuccess {
  const result = applyPirateMovementCore(state, playerId, hex, stealFromPlayerId);
  return { state: { ...result.state, phase: { name: "main" } }, events: result.events };
}
