import { hexEquals, verticesOfHex } from "../coordinates.js";
import { createRngFromState } from "../rng.js";
import type { PlayerId, ResourceType, RuleError } from "../types.js";
import { addHands, emptyHand, RESOURCE_TYPES, subtractHands } from "./resources.js";
import type { ApplySuccess, DiscardPhase, GameEvent, GameState, ResourceHand } from "./types.js";

export function validateRollDice(state: GameState, playerId: PlayerId): RuleError | null {
  if (state.phase.name !== "roll") {
    return { code: "WRONG_PHASE", message: "Not expecting a dice roll right now" };
  }
  if (state.players[state.currentPlayerIndex]?.id !== playerId) {
    return { code: "NOT_YOUR_TURN", message: `It is not ${playerId}'s turn to roll` };
  }
  return null;
}

export function computeProduction(
  state: GameState,
  roll: number,
): Map<PlayerId, Partial<ResourceHand>> {
  const demand = new Map<PlayerId, ResourceHand>();

  for (const tile of state.board.tiles) {
    if (tile.number !== roll || tile.terrain === "desert") continue;
    if (hexEquals(tile.hex, state.robber)) continue; // robber blocks production on its hex

    for (const vertex of verticesOfHex(tile.hex)) {
      const building = state.buildings.get(vertex.id);
      if (!building) continue;
      const amount = building.type === "city" ? 2 : 1;
      const hand = demand.get(building.playerId) ?? emptyHand();
      hand[tile.terrain] += amount;
      demand.set(building.playerId, hand);
    }
  }

  const production = new Map<PlayerId, Partial<ResourceHand>>();
  for (const resource of RESOURCE_TYPES) {
    const entitled = [...demand.entries()].filter(([, hand]) => hand[resource] > 0);
    if (entitled.length === 0) continue;

    const totalDemand = entitled.reduce((sum, [, hand]) => sum + hand[resource], 0);
    const bankAvailable = state.bank[resource];

    if (totalDemand <= bankAvailable) {
      for (const [playerId, hand] of entitled) {
        setProduced(production, playerId, resource, hand[resource]);
      }
    } else if (entitled.length === 1) {
      const [onlyPlayerId] = entitled[0]!;
      setProduced(production, onlyPlayerId, resource, bankAvailable);
    }
    // else: bank shortage affecting multiple players — nobody gets this resource this roll.
  }
  return production;
}

function setProduced(
  production: Map<PlayerId, Partial<ResourceHand>>,
  playerId: PlayerId,
  resource: ResourceType,
  amount: number,
): void {
  const existing = production.get(playerId) ?? {};
  production.set(playerId, { ...existing, [resource]: amount });
}

export function pendingDiscards(state: GameState): ReadonlyMap<PlayerId, number> {
  const pending = new Map<PlayerId, number>();
  for (const player of state.players) {
    const total = RESOURCE_TYPES.reduce((sum, r) => sum + player.hand[r], 0);
    if (total > 7) pending.set(player.id, Math.floor(total / 2));
  }
  return pending;
}

/** Assumes {@link validateRollDice} already passed. */
export function rollDice(state: GameState, playerId: PlayerId): ApplySuccess {
  const rng = createRngFromState(state.rngState);
  const die1 = rng.int(1, 7);
  const die2 = rng.int(1, 7);
  const roll: readonly [number, number] = [die1, die2];
  const total = die1 + die2;

  const events: GameEvent[] = [{ type: "DICE_ROLLED", playerId, roll }];
  const baseState: GameState = { ...state, rngState: rng.getState(), diceRoll: roll };

  if (total === 7) {
    const pending = pendingDiscards(baseState);
    if (pending.size > 0) {
      for (const [discardingPlayerId, count] of pending) {
        events.push({ type: "MUST_DISCARD", playerId: discardingPlayerId, count });
      }
      const phase: DiscardPhase = { name: "discard", pending };
      return { state: { ...baseState, phase }, events };
    }
    return { state: { ...baseState, phase: { name: "robber" } }, events };
  }

  const production = computeProduction(baseState, total);
  let players = baseState.players;
  let bank = baseState.bank;
  for (const [producingPlayerId, resources] of production) {
    players = players.map((p) =>
      p.id === producingPlayerId ? { ...p, hand: addHands(p.hand, resources) } : p,
    );
    bank = subtractHands(bank, resources);
  }
  if (production.size > 0) {
    events.push({ type: "RESOURCES_PRODUCED", production });
  }

  return { state: { ...baseState, players, bank, phase: { name: "main" } }, events };
}
