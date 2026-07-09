import { hexEquals, hexKey, verticesOfHex, type Hex } from "../coordinates.js";
import { createRngFromState } from "../rng.js";
import type { PlayerId, ResourceType, RuleError } from "../types.js";
import { addHands, handTotal, RESOURCE_TYPES, subtractHands } from "./resources.js";
import type { ApplySuccess, GameEvent, GameState, ResourceHand } from "./types.js";

export function validateDiscard(
  state: GameState,
  playerId: PlayerId,
  resources: Partial<ResourceHand>,
): RuleError | null {
  if (state.phase.name !== "discard") {
    return { code: "WRONG_PHASE", message: "Not expecting a discard right now" };
  }
  const owed = state.phase.pending.get(playerId);
  if (owed === undefined) {
    return { code: "NOT_PENDING", message: `${playerId} does not owe a discard` };
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { code: "UNKNOWN_PLAYER", message: `No such player ${playerId}` };

  const total = handTotal(resources);
  if (total !== owed) {
    return {
      code: "WRONG_DISCARD_COUNT",
      message: `${playerId} must discard exactly ${String(owed)} card(s), got ${String(total)}`,
    };
  }
  for (const resource of RESOURCE_TYPES) {
    if ((resources[resource] ?? 0) > player.hand[resource]) {
      return {
        code: "INSUFFICIENT_RESOURCES",
        message: `${playerId} does not have enough ${resource} to discard`,
      };
    }
  }
  return null;
}

/** Assumes {@link validateDiscard} already passed. */
export function discard(
  state: GameState,
  playerId: PlayerId,
  resources: Partial<ResourceHand>,
): ApplySuccess {
  if (state.phase.name !== "discard") {
    throw new Error("discard() called outside the discard phase");
  }
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, hand: subtractHands(p.hand, resources) } : p,
  );
  const bank = addHands(state.bank, resources);

  const pending = new Map(state.phase.pending);
  pending.delete(playerId);

  const events: GameEvent[] = [{ type: "DISCARDED", playerId, resources }];
  const phase =
    pending.size > 0 ? { name: "discard" as const, pending } : { name: "robber" as const };

  return { state: { ...state, players, bank, phase }, events };
}

export function eligibleStealTargets(
  state: GameState,
  hex: Hex,
  actingPlayerId: PlayerId,
): PlayerId[] {
  const targets = new Set<PlayerId>();
  for (const vertex of verticesOfHex(hex)) {
    const building = state.buildings.get(vertex.id);
    if (!building || building.playerId === actingPlayerId) continue;
    const victim = state.players.find((p) => p.id === building.playerId);
    if (victim && handTotal(victim.hand) > 0) targets.add(building.playerId);
  }
  return [...targets];
}

/**
 * The robber-move mechanics shared by a post-7-roll MOVE_ROBBER and a played
 * knight card: must move to a new on-board hex, and must steal from an
 * eligible adjacent player if any exist. Does NOT check phase/turn — callers
 * (validateMoveRobber for the dedicated phase, devCards.ts for knights)
 * apply their own gating on top of this.
 */
export function validateRobberMovementCore(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): RuleError | null {
  const onBoard = state.board.tiles.some((t) => hexKey(t.hex) === hexKey(hex));
  if (!onBoard) {
    return { code: "OUT_OF_BOUNDS", message: `Hex ${hexKey(hex)} is not on the board` };
  }
  if (hexEquals(hex, state.robber)) {
    return { code: "ROBBER_MUST_MOVE", message: "The robber must move to a new hex" };
  }

  const eligible = eligibleStealTargets(state, hex, playerId);
  if (stealFromPlayerId === null) {
    if (eligible.length > 0) {
      return {
        code: "MUST_STEAL",
        message: "At least one adjacent player can be stolen from and must be chosen",
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

export function validateMoveRobber(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): RuleError | null {
  if (state.phase.name !== "robber") {
    return { code: "WRONG_PHASE", message: "Not expecting a robber move right now" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn to move the robber` };
  }
  return validateRobberMovementCore(state, playerId, hex, stealFromPlayerId);
}

/**
 * The robber-move + steal transform, leaving `phase` untouched — callers
 * decide what phase follows (moveRobber() below lands in "main"; a played
 * knight card stays in "main" throughout).
 */
export function applyRobberMovementCore(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): ApplySuccess {
  const events: GameEvent[] = [{ type: "ROBBER_MOVED", playerId, hex }];
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

  return { state: { ...state, robber: hex, players, rngState }, events };
}

/**
 * Assumes {@link validateMoveRobber} already passed. Normally resolves to
 * `main`; if a Cities & Knights-style barbarian tribute was deferred behind
 * this same roll's 7 (see docs/rules/cities-knights-style.md §3), resolves
 * to `barbarianTribute` instead — harmless for every other module, since
 * `deferredBarbarianTribute` is always `null` there.
 */
export function moveRobber(
  state: GameState,
  playerId: PlayerId,
  hex: Hex,
  stealFromPlayerId: PlayerId | null,
): ApplySuccess {
  const result = applyRobberMovementCore(state, playerId, hex, stealFromPlayerId);
  const deferred = result.state.deferredBarbarianTribute;
  const phase = deferred
    ? ({ name: "barbarianTribute", pending: deferred } as const)
    : ({ name: "main" } as const);
  return {
    state: { ...result.state, phase, deferredBarbarianTribute: null },
    events: result.events,
  };
}
