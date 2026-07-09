import { describe, expect, it } from "vitest";
import { edgesOfVertex, verticesOfHex, type Edge, type Vertex } from "../../coordinates.js";
import { applyAction } from "../apply.js";
import { isEdgeOnBoard, satisfiesDistanceRule } from "../building.js";
import { createGame } from "../setup.js";
import { isRuleError, type Action, type ApplySuccess, type GameState } from "../types.js";
import { BASE_MODULE } from "./base.js";
import { FIVE_SIX_PLAYERS_MODULE } from "./fiveSixPlayers.js";
import { CITIES_KNIGHTS_MODULE } from "./citiesKnights.js";
import { createSeafarersModule } from "./seafarers.js";
import { TWIN_ISLES } from "../scenarios.js";
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

describe("Cities & Knights-style: config + dev-card replacement", () => {
  const modules = [BASE_MODULE, CITIES_KNIGHTS_MODULE];

  it("widens piece limits and the target VP range", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-config" });
    for (const player of state.players) {
      expect(player.pieces.knights).toBe(3);
      expect(player.pieces.cityWalls).toBe(5);
    }
    expect(() =>
      createGame(modules, { playerIds: ["a", "b"], seed: "ck-vp16", targetVictoryPoints: 16 }),
    ).not.toThrow();
  });

  it("shuffles non-empty progress card decks at game start", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-decks" });
    expect(state.tradeDeck).toHaveLength(8);
    expect(state.politicsDeck).toHaveLength(8);
    expect(state.scienceDeck).toHaveLength(7);
    expect(state.commodityBank).toEqual({ cloth: 10, coin: 10, paper: 10 });
  });

  it("rejects BUY_DEV_CARD and PLAY_DEV_CARD outright", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-nodevcards" });
    const resourced: GameState = { ...state, phase: { name: "main" } };
    expect(applyAction(modules, resourced, { type: "BUY_DEV_CARD", playerId: "a" })).toMatchObject({
      code: "NOT_AVAILABLE",
    });
    expect(
      applyAction(modules, resourced, {
        type: "PLAY_DEV_CARD",
        card: "knight",
        playerId: "a",
        hex: resourced.robber,
        stealFromPlayerId: null,
      }),
    ).toMatchObject({ code: "NOT_AVAILABLE" });
  });

  it("Largest Army never triggers, even with multiple high-level active knights", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-no-largest-army" });
    const v1 = allVertices(state)[0]!;
    const v2 = allVertices(state)[10]!;
    // Nothing in this module ever touches knightsPlayed, so Largest Army
    // stays permanently unqualified — confirmed via ROLL_DICE, which runs
    // the shared awards/victory post-processing same as any build action.
    const withKnights: GameState = {
      ...state,
      phase: { name: "roll" },
      knights: new Map([
        [v1.id, { playerId: "a", level: 3, active: true }],
        [v2.id, { playerId: "a", level: 3, active: true }],
      ]),
    };
    const result = apply(modules, withKnights, { type: "ROLL_DICE", playerId: "a" });
    expect(result.state.largestArmyPlayerId).toBeNull();
    expect(result.events.some((e) => e.type === "LARGEST_ARMY_AWARDED")).toBe(false);
  });
});

describe("Cities & Knights-style: knights, tracks, walls, metropolis end-to-end", () => {
  const modules = [BASE_MODULE, CITIES_KNIGHTS_MODULE];

  it("builds a knight, activates it, promotes it, improves a track, walls a city, and builds a metropolis", () => {
    let state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-e2e" });
    state = playSetup(modules, state, 2);
    expect(state.phase).toEqual({ name: "roll" });

    const aVertex = [...state.buildings.entries()].find(([, b]) => b.playerId === "a")![0];
    const vertexObj = allVertices(state).find((v) => v.id === aVertex)!;

    let resourced: GameState = {
      ...state,
      phase: { name: "main" },
      players: state.players.map((p) =>
        p.id === "a"
          ? {
              ...p,
              hand: { ...p.hand, ore: 1, wheat: 3, sheep: 1 },
              commodities: { cloth: 0, coin: 3, paper: 0 },
              cityImprovements: { trade: 0, politics: 4, science: 0 },
            }
          : p,
      ),
    };

    const afterBuy = apply(modules, resourced, {
      type: "BUY_KNIGHT",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterBuy.state.knights.get(vertexObj.id)).toEqual({
      playerId: "a",
      level: 1,
      active: false,
    });

    const afterActivate = apply(modules, afterBuy.state, {
      type: "ACTIVATE_KNIGHT",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterActivate.state.knights.get(vertexObj.id)!.active).toBe(true);

    const afterPromote1 = apply(modules, afterActivate.state, {
      type: "PROMOTE_KNIGHT",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterPromote1.state.knights.get(vertexObj.id)!.level).toBe(2);

    const afterPromote2 = apply(modules, afterPromote1.state, {
      type: "PROMOTE_KNIGHT",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterPromote2.state.knights.get(vertexObj.id)!.level).toBe(3);

    // Upgrade the settlement to a city so track improvements and walls are legal.
    resourced = {
      ...afterPromote2.state,
      players: afterPromote2.state.players.map((p) =>
        p.id === "a" ? { ...p, hand: { ...p.hand, ore: 3, wheat: 2 } } : p,
      ),
    };
    const afterCity = apply(modules, resourced, {
      type: "BUILD_CITY",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterCity.state.buildings.get(vertexObj.id)).toEqual({ playerId: "a", type: "city" });

    const withCommodities: GameState = {
      ...afterCity.state,
      players: afterCity.state.players.map((p) =>
        p.id === "a"
          ? { ...p, commodities: { cloth: 1, coin: 0, paper: 0 }, hand: { ...p.hand, brick: 2 } }
          : p,
      ),
    };
    const afterTrack = apply(modules, withCommodities, {
      type: "IMPROVE_CITY_TRACK",
      playerId: "a",
      track: "trade",
    });
    expect(afterTrack.state.players.find((p) => p.id === "a")!.cityImprovements.trade).toBe(1);

    const afterWall = apply(modules, afterTrack.state, {
      type: "BUILD_CITY_WALL",
      playerId: "a",
      vertex: vertexObj,
    });
    expect(afterWall.state.cityWalls.has(vertexObj.id)).toBe(true);

    // Push "a" to sole Trade leadership (level 4) and build a metropolis.
    const soleLeader: GameState = {
      ...afterWall.state,
      players: afterWall.state.players.map((p) =>
        p.id === "a" ? { ...p, cityImprovements: { ...p.cityImprovements, trade: 4 } } : p,
      ),
    };
    const afterMetropolis = apply(modules, soleLeader, {
      type: "BUILD_METROPOLIS",
      playerId: "a",
      vertex: vertexObj,
      track: "trade",
    });
    expect(afterMetropolis.state.metropolises.get("trade")).toEqual({
      playerId: "a",
      vertex: vertexObj.id,
    });
    expect(afterMetropolis.events.some((e) => e.type === "METROPOLIS_BUILT")).toBe(true);
  });
});

describe("composition: base + five-six-players + cities-knights-style", () => {
  const modules = [BASE_MODULE, FIVE_SIX_PLAYERS_MODULE, CITIES_KNIGHTS_MODULE];

  it("merges config from both modules and completes setup for 5 players", () => {
    const state = createGame(modules, { playerIds: ["a", "b", "c", "d", "e"], seed: "ck-5p" });
    expect(state.board.tiles).toHaveLength(28); // five-six-players' bigger board
    for (const player of state.players) {
      expect(player.pieces.knights).toBe(3); // C&K's knight supply
    }
    const played = playSetup(modules, state, 5);
    expect(played.phase).toEqual({ name: "roll" });
    expect(played.buildings.size).toBe(10);
  });
});

describe("composition: base + seafarers-style + cities-knights-style", () => {
  const modules = [BASE_MODULE, createSeafarersModule(TWIN_ISLES), CITIES_KNIGHTS_MODULE];

  it("both modules' pieces and mechanics coexist on a scenario board", () => {
    const state = createGame(modules, { playerIds: ["a", "b"], seed: "ck-seafarers" });
    expect(state.board.seaHexes).toEqual(TWIN_ISLES.seaHexes);
    for (const player of state.players) {
      expect(player.pieces.ships).toBe(15);
      expect(player.pieces.knights).toBe(3);
    }
  });
});
