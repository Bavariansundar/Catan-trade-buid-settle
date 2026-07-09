import { describe, expect, it } from "vitest";
import {
  applyAction,
  BASE_MODULE,
  createGame,
  isRuleError,
  satisfiesDistanceRule,
  validateBuildRoad,
  validateBuildSettlement,
  verticesOfEdge,
  type GameState,
} from "@hexhaven/engine";
import { allBoardEdges, allBoardVertices } from "./boardGeometry.js";
import {
  canBuyDevCard,
  legalCityVertices,
  legalMaritimeTrades,
  legalRoadEdges,
  legalSettlementVertices,
  robberMoveCandidates,
  sensibleDiscard,
} from "./legalActions.js";

const MODULES = [BASE_MODULE];

/** Plays through setup with the first-found legal vertex/edge each step, landing in the "roll" phase. */
function playThroughSetup(seed: number | string): GameState {
  let state = createGame(MODULES, { playerIds: ["a", "b"], seed });
  while (state.phase.name === "setup") {
    const playerId = state.phase.order[state.phase.step]!;
    if (!state.phase.awaitingRoad) {
      const vertex = legalSettlementVertices(state, playerId)[0]!;
      state = mustApply(state, { type: "PLACE_SETTLEMENT", playerId, vertex });
    } else {
      const edge = legalRoadEdges(state, playerId)[0]!;
      state = mustApply(state, { type: "PLACE_ROAD", playerId, edge });
    }
  }
  return state;
}

function mustApply(state: GameState, action: Parameters<typeof applyAction>[2]): GameState {
  const result = applyAction(MODULES, state, action);
  if (isRuleError(result)) throw new Error(`${action.type} rejected: ${result.code}`);
  return result.state;
}

describe("legalSettlementVertices / legalRoadEdges", () => {
  it("every candidate passes the real engine validator, and excludes at least one illegal vertex/edge", () => {
    const setupState = playThroughSetup("legal-actions-1");
    // A brand-new settlement needs a vertex 2+ roads out (the distance rule
    // excludes anything touching an existing building's own road directly)
    // — extend "a"'s network by one more road so at least one frontier
    // vertex is both connected and far enough away to be a legal spot.
    const resourcedForRoad: GameState = {
      ...setupState,
      phase: { name: "main" },
      players: setupState.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, wood: 3, brick: 3, wheat: 1, sheep: 1 } } : p,
      ),
    };
    const extraEdge = legalRoadEdges(resourcedForRoad, "a").find((edge) =>
      verticesOfEdge(edge).some(
        (v) => !resourcedForRoad.buildings.has(v.id) && satisfiesDistanceRule(resourcedForRoad, v),
      ),
    )!;
    const state = mustApply(resourcedForRoad, {
      type: "BUILD_ROAD",
      playerId: "a",
      edge: extraEdge,
    });

    const settlementCandidates = legalSettlementVertices(state, "a");
    expect(settlementCandidates.length).toBeGreaterThan(0);
    for (const vertex of settlementCandidates) {
      expect(validateBuildSettlement(state, "a", vertex)).toBeNull();
    }
    const occupiedVertex = [...state.buildings.keys()][0]!;
    expect(settlementCandidates.some((v) => v.id === occupiedVertex)).toBe(false);

    const roadCandidates = legalRoadEdges(state, "a");
    for (const edge of roadCandidates) {
      expect(validateBuildRoad(state, "a", edge)).toBeNull();
    }
    expect(roadCandidates.length).toBeLessThan(allBoardEdges(state).length);
    expect(allBoardVertices(state).length).toBeGreaterThan(settlementCandidates.length);
  });
});

describe("legalCityVertices", () => {
  it("only ever offers vertices holding the player's own settlement, and only when affordable", () => {
    const setupState = playThroughSetup("legal-actions-2");
    const ownSettlements = [...setupState.buildings.entries()].filter(
      ([, b]) => b.playerId === "a",
    );

    const broke: GameState = { ...setupState, phase: { name: "main" } };
    expect(legalCityVertices(broke, "a")).toHaveLength(0); // fresh out of setup, can't afford ore/wheat

    const resourced: GameState = {
      ...broke,
      players: broke.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, ore: 3, wheat: 2 } } : p,
      ),
    };
    const cityCandidates = legalCityVertices(resourced, "a");
    expect(cityCandidates.length).toBe(ownSettlements.length);
    expect(cityCandidates.every((v) => ownSettlements.some(([id]) => id === v.id))).toBe(true);
  });
});

describe("robberMoveCandidates", () => {
  it("never includes the robber's current hex", () => {
    const state = playThroughSetup("legal-actions-3");
    const candidates = robberMoveCandidates(state, "a");
    expect(candidates.every((c) => c.hex.q !== state.robber.q || c.hex.r !== state.robber.r)).toBe(
      true,
    );
  });
});

describe("legalMaritimeTrades / canBuyDevCard", () => {
  it("requires the ratio's worth of the given resource", () => {
    const state = playThroughSetup("legal-actions-4");
    const resourced: GameState = {
      ...state,
      phase: { name: "main" },
      players: state.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, wood: 4 } } : p,
      ),
    };
    const trades = legalMaritimeTrades(resourced, "a");
    expect(trades.some((t) => t.give === "wood")).toBe(true);
  });

  it("is false without the dev card cost affordable", () => {
    const state = playThroughSetup("legal-actions-5");
    const broke: GameState = {
      ...state,
      phase: { name: "main" },
      players: state.players.map((p) => (p.id === "a" ? { ...p, hand: { ...p.hand } } : p)),
    };
    expect(canBuyDevCard(broke, "a")).toBe(false);
  });
});

describe("sensibleDiscard", () => {
  it("discards from the largest stacks first, down to exactly the owed count", () => {
    const hand = { wood: 5, wheat: 1, sheep: 0, brick: 2, ore: 0 };
    const discard = sensibleDiscard(hand, 4);
    const total = Object.values(discard).reduce((sum, n) => sum + (n ?? 0), 0);
    expect(total).toBe(4);
    expect(discard.wood).toBe(4); // the largest stack is depleted first
  });
});
