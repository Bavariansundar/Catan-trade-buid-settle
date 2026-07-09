import { verticesOfHex, type Vertex } from "../coordinates.js";
import type { PlayerId, RuleError } from "../types.js";
import { addHands, BUILD_COSTS } from "./resources.js";
import type {
  ApplySuccess,
  BarbarianTributePhase,
  ChooseCityToDowngradeAction,
  GameEvent,
  GameState,
} from "./types.js";

/** Scales with player count so the average pace between attacks stays roughly constant — see docs/rules/cities-knights-style.md §6. */
export function barbarianAttackThreshold(playerCount: number): number {
  return 3 * playerCount;
}

function findVertexById(state: GameState, vertexId: string): Vertex {
  for (const tile of state.board.tiles) {
    const found = verticesOfHex(tile.hex).find((v) => v.id === vertexId);
    if (found) return found;
  }
  throw new Error(`No vertex found on the board for id ${vertexId}`);
}

function activeKnightLevelSum(state: GameState, playerId: PlayerId): number {
  let sum = 0;
  for (const knight of state.knights.values()) {
    if (knight.playerId === playerId && knight.active) sum += knight.level;
  }
  return sum;
}

function downgradeCityAt(state: GameState, playerId: PlayerId, vertexId: string): GameState {
  const buildings = new Map(state.buildings);
  buildings.set(vertexId, { playerId, type: "settlement" });
  const players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          pieces: {
            ...p.pieces,
            cities: p.pieces.cities + 1,
            settlements: p.pieces.settlements - 1,
          },
        }
      : p,
  );
  const bank = addHands(state.bank, BUILD_COSTS.city);
  return { ...state, buildings, players, bank };
}

/**
 * Advances the barbarian track by 1; resolves the attack and resets to 0 if
 * the threshold is reached — see docs/rules/cities-knights-style.md §6.
 */
export function advanceBarbarianTrack(state: GameState): ApplySuccess {
  const position = state.barbarianTrackPosition + 1;
  const threshold = barbarianAttackThreshold(state.players.length);
  const events: GameEvent[] = [{ type: "BARBARIAN_ADVANCED", position }];

  if (position < threshold) {
    return { state: { ...state, barbarianTrackPosition: position }, events };
  }

  const attackResult = resolveBarbarianAttack({ ...state, barbarianTrackPosition: 0 });
  return { state: attackResult.state, events: [...events, ...attackResult.events] };
}

/** Assumes `state.barbarianTrackPosition` has already been reset to 0. */
export function resolveBarbarianAttack(state: GameState): ApplySuccess {
  const cityCountByPlayer = new Map<PlayerId, number>();
  for (const building of state.buildings.values()) {
    if (building.type !== "city") continue;
    cityCountByPlayer.set(building.playerId, (cityCountByPlayer.get(building.playerId) ?? 0) + 1);
  }
  const strength = [...cityCountByPlayer.values()].reduce((sum, n) => sum + n, 0);

  const defenseByPlayer = new Map(
    state.players.map((p) => [p.id, activeKnightLevelSum(state, p.id)]),
  );
  const totalDefense = [...defenseByPlayer.values()].reduce((sum, n) => sum + n, 0);

  if (totalDefense >= strength) {
    const maxDefense = Math.max(0, ...defenseByPlayer.values());
    const rewarded =
      maxDefense > 0
        ? [...defenseByPlayer.entries()].filter(([, v]) => v === maxDefense).map(([id]) => id)
        : [];
    const players = state.players.map((p) =>
      rewarded.includes(p.id) ? { ...p, barbarianDefenseWins: p.barbarianDefenseWins + 1 } : p,
    );
    return {
      state: { ...state, players },
      events: [{ type: "BARBARIAN_ATTACK_DEFENDED", rewardedPlayerIds: rewarded }],
    };
  }

  const eligibleLosers = [...cityCountByPlayer.keys()];
  if (eligibleLosers.length === 0) {
    return { state, events: [{ type: "BARBARIAN_ATTACK_LOST", losingPlayerIds: [] }] };
  }
  const minDefense = Math.min(...eligibleLosers.map((id) => defenseByPlayer.get(id) ?? 0));
  const losers = eligibleLosers.filter((id) => (defenseByPlayer.get(id) ?? 0) === minDefense);

  let nextState = state;
  const events: GameEvent[] = [{ type: "BARBARIAN_ATTACK_LOST", losingPlayerIds: losers }];
  const pending = new Map<PlayerId, number>();

  for (const loserId of losers) {
    const citiesOwned = [...nextState.buildings.entries()].filter(
      ([, b]) => b.playerId === loserId && b.type === "city",
    );
    if (citiesOwned.length === 1) {
      const [vertexId] = citiesOwned[0]!;
      nextState = downgradeCityAt(nextState, loserId, vertexId);
      events.push({
        type: "CITY_DOWNGRADED",
        playerId: loserId,
        vertex: findVertexById(state, vertexId),
      });
    } else {
      pending.set(loserId, 1);
    }
  }

  if (pending.size > 0) {
    const phase: BarbarianTributePhase = { name: "barbarianTribute", pending };
    return { state: { ...nextState, phase }, events };
  }
  return { state: nextState, events };
}

export function validateChooseCityToDowngrade(
  state: GameState,
  action: ChooseCityToDowngradeAction,
): RuleError | null {
  if (state.phase.name !== "barbarianTribute") {
    return { code: "WRONG_PHASE", message: "Not expecting a city downgrade choice right now" };
  }
  const owed = state.phase.pending.get(action.playerId);
  if (owed === undefined) {
    return { code: "NOT_PENDING", message: `${action.playerId} does not owe a city downgrade` };
  }
  const building = state.buildings.get(action.vertex.id);
  if (!building || building.playerId !== action.playerId || building.type !== "city") {
    return {
      code: "NOT_YOUR_CITY",
      message: `${action.playerId} has no city at ${action.vertex.id}`,
    };
  }
  return null;
}

/** Assumes {@link validateChooseCityToDowngrade} already passed. */
export function chooseCityToDowngrade(
  state: GameState,
  action: ChooseCityToDowngradeAction,
): ApplySuccess {
  const phase = state.phase as BarbarianTributePhase;
  const nextState = downgradeCityAt(state, action.playerId, action.vertex.id);

  const pending = new Map(phase.pending);
  pending.delete(action.playerId);
  const nextPhase =
    pending.size > 0 ? { name: "barbarianTribute" as const, pending } : { name: "main" as const };

  return {
    state: { ...nextState, phase: nextPhase },
    events: [{ type: "CITY_DOWNGRADED", playerId: action.playerId, vertex: action.vertex }],
  };
}
