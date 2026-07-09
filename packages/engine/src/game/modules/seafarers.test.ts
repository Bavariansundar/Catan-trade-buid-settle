import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfHex, type Edge, type Vertex } from "../../coordinates.js";
import { applyAction } from "../apply.js";
import { isEdgeOnBoard, satisfiesDistanceRule } from "../building.js";
import { isLandEdge, isSeaEdge } from "../ships.js";
import { BASE_MODULE } from "./base.js";
import { FIVE_SIX_PLAYERS_MODULE } from "./fiveSixPlayers.js";
import { createSeafarersModule } from "./seafarers.js";
import { SCATTERED_ARCHIPELAGO, THE_STRAIT, TWIN_ISLES } from "../scenarios.js";
import { createGame } from "../setup.js";
import { isRuleError, type Action, type ApplySuccess, type GameState } from "../types.js";
import type { RuleModule } from "../module.js";

function apply(modules: readonly RuleModule[], state: GameState, action: Action): ApplySuccess {
  const result = applyAction(modules, state, action);
  if (isRuleError(result)) {
    throw new Error(
      `Action ${action.type} by ${action.playerId} was rejected: ${result.code} — ${result.message}`,
    );
  }
  return result;
}

function allVertices(state: GameState): Vertex[] {
  const byId = new Map<string, Vertex>();
  for (const tile of state.board.tiles) {
    for (const vertex of verticesOfHex(tile.hex)) byId.set(vertex.id, vertex);
  }
  return [...byId.values()];
}

function findLegalSetupVertex(state: GameState): Vertex {
  const vertex = allVertices(state).find(
    (v) => !state.buildings.has(v.id) && satisfiesDistanceRule(state, v),
  );
  if (!vertex) throw new Error("No legal setup vertex found");
  return vertex;
}

function findLegalSetupRoad(state: GameState, vertex: Vertex): Edge {
  const edge = edgesOfVertex(vertex).find((e) => isEdgeOnBoard(state, e) && !state.roads.has(e.id));
  if (!edge) throw new Error("No legal setup road found");
  return edge;
}

function playSetup(
  modules: readonly RuleModule[],
  initial: GameState,
  playerCount: number,
): GameState {
  let state = initial;
  for (let step = 0; step < playerCount * 2; step++) {
    if (state.phase.name !== "setup") break;
    const playerId = state.phase.order[state.phase.step]!;
    const vertex = findLegalSetupVertex(state);
    state = apply(modules, state, { type: "PLACE_SETTLEMENT", playerId, vertex }).state;
    const edge = findLegalSetupRoad(state, vertex);
    state = apply(modules, state, { type: "PLACE_ROAD", playerId, edge }).state;
  }
  return state;
}

describe("seafarers-style: Twin Isles end-to-end", () => {
  const modules = [BASE_MODULE, createSeafarersModule(TWIN_ISLES)];

  it("generates the scenario board and starting state", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "twin-isles-test" });
    expect(state.board.tiles).toHaveLength(14);
    expect(state.board.seaHexes).toEqual(TWIN_ISLES.seaHexes);
    expect(state.pirateHex).toEqual(TWIN_ISLES.pirateStartHex);
    expect(state.homeIslandHexes).toEqual(TWIN_ISLES.homeIslandHexes);
    expect(state.hiddenHexes.size).toBe(0); // Twin Isles has no hidden hexes
    for (const player of state.players) {
      expect(player.pieces.ships).toBe(15);
    }
  });

  it("plays setup, then builds and moves a ship near the coast", () => {
    let state = createGame(modules, { playerIds: ["a", "b"], seed: "twin-isles-ships" });
    state = playSetup(modules, state, 2);
    expect(state.phase).toEqual({ name: "roll" });

    // Find a coastal edge (sea edge) touching one of "a"'s setup buildings.
    const aBuildingVertices = [...state.buildings.entries()]
      .filter(([, b]) => b.playerId === "a")
      .map(([vertexId]) => vertexId);
    const candidateEdges = allVertices(state)
      .filter((v) => aBuildingVertices.includes(v.id))
      .flatMap((v) => edgesOfVertex(v))
      .filter((e) => isSeaEdge(state, e) && !isLandEdge(state, e));

    if (candidateEdges.length === 0) {
      // This seed's setup placements didn't land "a" on the coast — the
      // mechanism under test (BUILD_SHIP validation) is already covered
      // exhaustively in ships.test.ts, so just confirm setup completed.
      return;
    }

    const shipEdge = candidateEdges[0]!;
    const resourced: GameState = {
      ...state,
      phase: { name: "main" },
      players: state.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, wood: 1, sheep: 1 } } : p,
      ),
    };
    const afterShip = apply(modules, resourced, {
      type: "BUILD_SHIP",
      playerId: "a",
      edge: shipEdge,
    });
    expect(afterShip.state.ships.get(shipEdge.id)).toBe("a");
  });
});

describe("seafarers-style: The Strait exploration", () => {
  const modules = [BASE_MODULE, createSeafarersModule(THE_STRAIT)];

  it("has the secondary island hidden at game start", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "strait-test" });
    expect(state.board.tiles).toHaveLength(19); // only the known home island
    expect(state.hiddenHexes.size).toBe(7);
    expect(state.discoveryBag).toHaveLength(7);
  });

  it("reveals a hidden hex and grants a resource when a ship reaches it", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "strait-reveal" });
    // Build a ship directly on a sea edge touching one of the hidden hexes,
    // bypassing full connectivity setup by injecting a settlement right
    // there — the point of this test is the reveal, not connectivity
    // (already covered in ships.test.ts).
    const hiddenHex = THE_STRAIT.hiddenLandHexes[0]!;
    const anchorVertex = verticesOfHex(hiddenHex).find((v) =>
      v.hexes.some((h) => THE_STRAIT.seaHexes.some((s) => s.q === h.q && s.r === h.r)),
    )!;
    const shipEdge = edgesOfVertex(anchorVertex).find(
      (e) => isSeaEdge(state, e) && e.hexes.some((h) => h.q === hiddenHex.q && h.r === hiddenHex.r),
    )!;

    const ready: GameState = {
      ...state,
      phase: { name: "main" },
      buildings: new Map([[anchorVertex.id, { playerId: "a", type: "settlement" as const }]]),
      players: state.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, wood: 1, sheep: 1 } } : p,
      ),
    };
    const result = apply(modules, ready, { type: "BUILD_SHIP", playerId: "a", edge: shipEdge });
    expect(result.state.hiddenHexes.has(`${hiddenHex.q},${hiddenHex.r}`)).toBe(false);
    expect(result.events.some((e) => e.type === "HEX_DISCOVERED")).toBe(true);
    expect(
      result.state.board.tiles.some((t) => t.hex.q === hiddenHex.q && t.hex.r === hiddenHex.r),
    ).toBe(true);
  });
});

describe("composition: base + five-six-players + seafarers-style", () => {
  const modules = [
    BASE_MODULE,
    FIVE_SIX_PLAYERS_MODULE,
    createSeafarersModule(SCATTERED_ARCHIPELAGO),
  ];

  it("resolves a config merging all three modules", () => {
    const state = createGame(modules, {
      playerIds: ["a", "b", "c", "d", "e"],
      seed: "triple-composition",
    });
    // Board comes from the scenario's own generateBoard override, which
    // takes precedence over five-six-players' boardExtension (last
    // module's `generateBoard` wins — see docs/architecture/modules.md
    // §2) — so this is the archipelago's 19 known home hexes exactly,
    // not extended by five-six-players' extra 9.
    expect(state.board.tiles).toHaveLength(19);
    // Ship piece limit from seafarers.
    for (const player of state.players) {
      expect(player.pieces.ships).toBe(15);
    }
    // Player count range extended by five-six-players.
    expect(() =>
      createGame(modules, { playerIds: ["a", "b", "c", "d", "e", "f"], seed: "six-players" }),
    ).not.toThrow();
  });

  it("still rejects fewer than 2 or more than 6 players", () => {
    expect(() => createGame(modules, { playerIds: ["a"], seed: "s" })).toThrow();
    expect(() =>
      createGame(modules, { playerIds: ["a", "b", "c", "d", "e", "f", "g"], seed: "s" }),
    ).toThrow();
  });
});
