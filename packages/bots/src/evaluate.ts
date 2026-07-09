import {
  computeVictoryPoints,
  hexEquals,
  verticesOfEdge,
  verticesOfHex,
  type GameState,
  type PlayerId,
  type RuleModule,
  type TerrainType,
} from "@hexhaven/engine";
import { legalSettlementVertices } from "./legalActions.js";

/** Standard pip weight for a dice number: how often it rolls per 36 two-die outcomes. */
const PIP_WEIGHT: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

function productionPips(
  state: GameState,
  playerId: PlayerId,
): { total: number; byResource: Set<TerrainType> } {
  let total = 0;
  const byResource = new Set<TerrainType>();
  for (const tile of state.board.tiles) {
    if (tile.terrain === "desert" || tile.number === null) continue;
    if (hexEquals(tile.hex, state.robber)) continue;
    const weight = PIP_WEIGHT[tile.number] ?? 0;
    for (const vertex of verticesOfHex(tile.hex)) {
      const building = state.buildings.get(vertex.id);
      if (building?.playerId !== playerId) continue;
      const multiplier = building.type === "city" ? 2 : 1;
      total += weight * multiplier;
      byResource.add(tile.terrain);
    }
  }
  return { total, byResource };
}

function portSynergy(state: GameState, playerId: PlayerId, produced: Set<TerrainType>): number {
  let bonus = 0;
  for (const harbor of state.board.harbors) {
    const [v1, v2] = verticesOfEdge(harbor.edge);
    const owns =
      state.buildings.get(v1.id)?.playerId === playerId ||
      state.buildings.get(v2.id)?.playerId === playerId;
    if (!owns) continue;
    if (harbor.type === "generic") bonus += 1;
    else if (produced.has(harbor.type)) bonus += 3;
    else bonus += 0.5;
  }
  return bonus;
}

/**
 * A single weighted score for `state` from `playerId`'s perspective — higher
 * is better. Used by HeuristicBot's one-ply lookahead (compare candidate
 * next-states) and by MCTSBot as the reward proxy for a rollout that didn't
 * reach a terminal state within its bounded depth. Not meant to be
 * human-meaningful in absolute terms, only comparable across states for the
 * same player.
 */
export function evaluateState(
  modules: readonly RuleModule[],
  state: GameState,
  playerId: PlayerId,
): number {
  const vp = computeVictoryPoints(modules, state, playerId);
  const { total: pips, byResource } = productionPips(state, playerId);
  const diversity = byResource.size;
  const ports = portSynergy(state, playerId, byResource);
  const expansion = legalSettlementVertices(state, playerId).length;

  let blocking = 0;
  for (const vertex of verticesOfHex(state.robber)) {
    const building = state.buildings.get(vertex.id);
    if (!building) continue;
    blocking += building.playerId === playerId ? -4 : 1;
  }

  return vp * 100 + pips * 4 + diversity * 2 + ports * 2 + expansion * 0.5 + blocking;
}
