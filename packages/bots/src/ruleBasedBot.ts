import {
  canAfford,
  BUILD_COSTS,
  verticesOfEdge,
  verticesOfHex,
  hexEquals,
  type Action,
  type DiscardAction,
  type Edge,
  type GameState,
  type PlayerId,
  type ResourceType,
  type RuleModule,
  type Vertex,
} from "@baychearsbar/engine";
import {
  canBuyDevCard,
  legalCityVertices,
  legalMaritimeTrades,
  legalRoadEdges,
  legalSettlementVertices,
  playableDevCardTypes,
  robberMoveCandidates,
  sensibleDiscard,
} from "./legalActions.js";
import type { Bot } from "./types.js";

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

/** Sum of pip weights across every hex touching `vertex` (production value of a settlement spot). */
function vertexPipScore(state: GameState, vertex: Vertex): number {
  let score = 0;
  for (const hex of vertex.hexes) {
    const tile = state.board.tiles.find((t) => hexEquals(t.hex, hex));
    if (tile && tile.terrain !== "desert" && tile.number !== null)
      score += PIP_WEIGHT[tile.number] ?? 0;
  }
  return score;
}

function bestByPipScore(state: GameState, vertices: readonly Vertex[]): Vertex | undefined {
  return [...vertices].sort((a, b) => vertexPipScore(state, b) - vertexPipScore(state, a))[0];
}

/** The better of an edge's two endpoints, by production value — used to steer road placement. */
function bestEndpointScore(state: GameState, edge: Edge): number {
  const [v1, v2] = verticesOfEdge(edge);
  return Math.max(vertexPipScore(state, v1), vertexPipScore(state, v2));
}

function bestRoadTowardExpansion(state: GameState, edges: readonly Edge[]): Edge {
  return [...edges].sort((a, b) => bestEndpointScore(state, b) - bestEndpointScore(state, a))[0]!;
}

/**
 * A legal-move sampler with simple, fast priorities — used both as a
 * standalone easy-difficulty bot and as MCTSBot's rollout policy (see
 * mctsBot.ts), where it needs to run many times per second. Deliberately
 * has no lookahead or board evaluation beyond "how many pips does this hex
 * touch" — see evaluate.ts / heuristicBot.ts for the tier that adds that.
 *
 * Scoped to base/five-six-players only, per types.ts's scope note — never
 * asked to decide in a Cities & Knights-style `barbarianTribute` phase or a
 * Seafarers-style ship/pirate action.
 */
export class RuleBasedBot implements Bot {
  readonly name = "RuleBasedBot";

  chooseAction(state: GameState, playerId: PlayerId, modules: readonly RuleModule[]): Action {
    switch (state.phase.name) {
      case "setup":
        return this.chooseSetupAction(state, playerId);
      case "roll":
        return { type: "ROLL_DICE", playerId };
      case "discard":
        return this.chooseDiscard(state, playerId);
      case "robber":
        return this.chooseRobberMove(state, playerId);
      case "main":
      case "specialBuild":
        return this.chooseMainAction(state, playerId, modules);
      default:
        throw new Error(`RuleBasedBot cannot decide in phase "${state.phase.name}" (out of scope)`);
    }
  }

  private chooseSetupAction(state: GameState, playerId: PlayerId): Action {
    if (state.phase.name !== "setup") throw new Error("unreachable");
    if (state.phase.awaitingRoad) {
      const edges = legalRoadEdges(state, playerId);
      return { type: "PLACE_ROAD", playerId, edge: bestRoadTowardExpansion(state, edges) };
    }
    const vertex = bestByPipScore(state, legalSettlementVertices(state, playerId))!;
    return { type: "PLACE_SETTLEMENT", playerId, vertex };
  }

  private chooseDiscard(state: GameState, playerId: PlayerId): DiscardAction {
    if (state.phase.name !== "discard") throw new Error("unreachable");
    const owed = state.phase.pending.get(playerId) ?? 0;
    const player = state.players.find((p) => p.id === playerId)!;
    return { type: "DISCARD", playerId, resources: sensibleDiscard(player.hand, owed) };
  }

  private chooseRobberMove(state: GameState, playerId: PlayerId): Action {
    const candidates = robberMoveCandidates(state, playerId);
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const tile = state.board.tiles.find((t) => hexEquals(t.hex, candidate.hex));
      const weight =
        tile?.number !== undefined && tile.number !== null ? (PIP_WEIGHT[tile.number] ?? 0) : 0;

      let score = 0;
      for (const vertex of verticesOfHex(candidate.hex)) {
        const building = state.buildings.get(vertex.id);
        if (!building || building.playerId === playerId) continue;
        score += (building.type === "city" ? 2 : 1) * weight;
      }
      if (candidate.stealFromPlayerId) {
        const victim = state.players.find((p) => p.id === candidate.stealFromPlayerId)!;
        score +=
          victim.hand.wood +
          victim.hand.wheat +
          victim.hand.sheep +
          victim.hand.brick +
          victim.hand.ore;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    const chosen = best ?? { hex: state.robber, stealFromPlayerId: null };
    return {
      type: "MOVE_ROBBER",
      playerId,
      hex: chosen.hex,
      stealFromPlayerId: chosen.stealFromPlayerId,
    };
  }

  private chooseMainAction(
    state: GameState,
    playerId: PlayerId,
    modules: readonly RuleModule[],
  ): Action {
    void modules; // no module-specific behavior at this tier — see class doc
    const player = state.players.find((p) => p.id === playerId)!;

    const settlementVertex = bestByPipScore(state, legalSettlementVertices(state, playerId));
    if (settlementVertex && canAfford(player.hand, BUILD_COSTS.settlement)) {
      return { type: "BUILD_SETTLEMENT", playerId, vertex: settlementVertex };
    }

    const cityVertex = bestByPipScore(state, legalCityVertices(state, playerId));
    if (cityVertex && canAfford(player.hand, BUILD_COSTS.city)) {
      return { type: "BUILD_CITY", playerId, vertex: cityVertex };
    }

    const roadEdges = legalRoadEdges(state, playerId);
    if (roadEdges.length > 0 && canAfford(player.hand, BUILD_COSTS.road)) {
      return { type: "BUILD_ROAD", playerId, edge: bestRoadTowardExpansion(state, roadEdges) };
    }

    if (canBuyDevCard(state, playerId) && canAfford(player.hand, BUILD_COSTS.devCard)) {
      return { type: "BUY_DEV_CARD", playerId };
    }

    if (state.phase.name === "main") {
      const robberSitsOnOwnHex = verticesOfHex(state.robber).some(
        (v) => state.buildings.get(v.id)?.playerId === playerId,
      );
      if (robberSitsOnOwnHex && playableDevCardTypes(state, playerId).includes("knight")) {
        const target = robberMoveCandidates(state, playerId)[0];
        if (target) {
          return {
            type: "PLAY_DEV_CARD",
            card: "knight",
            playerId,
            hex: target.hex,
            stealFromPlayerId: target.stealFromPlayerId,
          };
        }
      }

      const trade = this.tradeTowardNextBuild(state, playerId);
      if (trade) return trade;
      return { type: "END_TURN", playerId };
    }

    return { type: "PASS_SPECIAL_BUILD", playerId };
  }

  /** If missing a resource type entirely, trade a surplus resource for one via the best available port/bank rate. */
  private tradeTowardNextBuild(state: GameState, playerId: PlayerId): Action | null {
    const player = state.players.find((p) => p.id === playerId)!;
    const resourceTypes: ResourceType[] = ["wood", "brick", "wheat", "sheep", "ore"];
    const need = resourceTypes.find((r) => player.hand[r] === 0);
    if (!need) return null;
    const trades = legalMaritimeTrades(state, playerId).filter((t) => t.get === need);
    return trades[0]
      ? { type: "MARITIME_TRADE", playerId, give: trades[0].give, get: trades[0].get }
      : null;
  }
}
