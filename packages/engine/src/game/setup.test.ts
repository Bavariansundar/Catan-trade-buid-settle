import { describe, expect, it } from "vitest";
import { BASE_MODULE } from "./modules/base.js";
import { edgesOfVertex, neighborVertices, verticesOfHex } from "../coordinates.js";
import { applyAction } from "./apply.js";
import { createGame } from "./setup.js";
import { isRuleError, type Action, type ApplySuccess, type GameState } from "./types.js";

function apply(state: GameState, action: Action): ApplySuccess {
  const result = applyAction([BASE_MODULE], state, action);
  if (isRuleError(result)) {
    throw new Error(`Expected success, got RuleError ${result.code}: ${result.message}`);
  }
  return result;
}

describe("createGame", () => {
  it("throws for fewer than 2 players", () => {
    expect(() => createGame([BASE_MODULE], { playerIds: ["a"], seed: 1 })).toThrow();
  });

  it("throws for more than 4 players", () => {
    expect(() =>
      createGame([BASE_MODULE], { playerIds: ["a", "b", "c", "d", "e"], seed: 1 }),
    ).toThrow();
  });

  it("throws for duplicate player ids", () => {
    expect(() => createGame([BASE_MODULE], { playerIds: ["a", "a"], seed: 1 })).toThrow();
  });

  it("starts in the setup phase with a snake-draft order", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b", "c"], seed: 1 });
    expect(state.phase).toEqual({
      name: "setup",
      order: ["a", "b", "c", "c", "b", "a"],
      step: 0,
      awaitingRoad: false,
      lastSettlementVertex: null,
    });
  });

  it("gives every player full starting piece supply and an empty hand", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: 1 });
    for (const player of state.players) {
      expect(player.hand).toEqual({ wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 });
      expect(player.pieces).toEqual({ settlements: 5, cities: 4, roads: 15, ships: 0 });
    }
  });

  it("places the robber on the desert", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: 1 });
    const desert = state.board.tiles.find((t) => t.terrain === "desert")!;
    expect(state.robber).toEqual(desert.hex);
  });

  it("is deterministic for a given seed", () => {
    const a = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "fixed" });
    const b = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "fixed" });
    expect(a).toEqual(b);
  });
});

describe("setup phase — PLACE_SETTLEMENT / PLACE_ROAD", () => {
  function twoPlayerGame(): GameState {
    return createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "setup-test" });
  }

  it("rejects a settlement placement from the wrong player", () => {
    const state = twoPlayerGame();
    const [hex] = state.board.tiles;
    const vertex = verticesOfHex(hex!.hex)[0]!;
    const result = applyAction([BASE_MODULE], state, {
      type: "PLACE_SETTLEMENT",
      playerId: "b",
      vertex,
    });
    expect(isRuleError(result)).toBe(true);
    if (isRuleError(result)) expect(result.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects a road before the first settlement of a step", () => {
    const state = twoPlayerGame();
    const hex = state.board.tiles[0]!.hex;
    const edge = edgesOfVertex(verticesOfHex(hex)[0]!)[0];
    const result = applyAction([BASE_MODULE], state, { type: "PLACE_ROAD", playerId: "a", edge });
    expect(isRuleError(result)).toBe(true);
    if (isRuleError(result)) expect(result.code).toBe("SETTLEMENT_EXPECTED");
  });

  it("accepts a legal first settlement + road, then advances to the next player", () => {
    const state = twoPlayerGame();
    const hex = state.board.tiles[0]!.hex;
    const vertex = verticesOfHex(hex)[0]!;

    const afterSettlement = apply(state, {
      type: "PLACE_SETTLEMENT",
      playerId: "a",
      vertex,
    });
    expect(afterSettlement.state.buildings.get(vertex.id)).toEqual({
      playerId: "a",
      type: "settlement",
    });
    expect(afterSettlement.state.phase).toMatchObject({ awaitingRoad: true, step: 0 });

    const edge = edgesOfVertex(vertex)[0];
    const afterRoad = apply(afterSettlement.state, {
      type: "PLACE_ROAD",
      playerId: "a",
      edge,
    });
    expect(afterRoad.state.roads.get(edge.id)).toBe("a");
    expect(afterRoad.state.phase).toMatchObject({ name: "setup", step: 1, awaitingRoad: false });
    // Next up in snake draft ["a","b","b","a"] after step 0 is player "b".
    expect(afterRoad.state.currentPlayerIndex).toBe(
      afterRoad.state.players.findIndex((p) => p.id === "b"),
    );
  });

  it("rejects a road that doesn't touch the settlement just placed", () => {
    const state = twoPlayerGame();
    const hex = state.board.tiles[0]!.hex;
    const vertex = verticesOfHex(hex)[0]!;
    const afterSettlement = apply(state, { type: "PLACE_SETTLEMENT", playerId: "a", vertex });

    // Find some far-away edge that does NOT touch `vertex`.
    const farHex = state.board.tiles[state.board.tiles.length - 1]!.hex;
    const farVertex = verticesOfHex(farHex)[0]!;
    const farEdge = edgesOfVertex(farVertex)[0];
    expect(edgesOfVertex(vertex).some((e) => e.id === farEdge.id)).toBe(false);

    const result = applyAction([BASE_MODULE], afterSettlement.state, {
      type: "PLACE_ROAD",
      playerId: "a",
      edge: farEdge,
    });
    expect(isRuleError(result)).toBe(true);
    if (isRuleError(result)) expect(result.code).toBe("NOT_CONNECTED");
  });

  it("rejects a settlement placement violating the distance rule", () => {
    const state = twoPlayerGame();
    const hex = state.board.tiles[0]!.hex;
    const vertex = verticesOfHex(hex)[0]!;
    const afterSettlement = apply(state, { type: "PLACE_SETTLEMENT", playerId: "a", vertex });
    const edge = edgesOfVertex(vertex)[0];
    const afterRoad = apply(afterSettlement.state, { type: "PLACE_ROAD", playerId: "a", edge });

    // b's turn now; try to place adjacent to a's settlement (illegal: too close).
    const target = neighborVertices(vertex)[0]!;

    const result = applyAction([BASE_MODULE], afterRoad.state, {
      type: "PLACE_SETTLEMENT",
      playerId: "b",
      vertex: target,
    });
    expect(isRuleError(result)).toBe(true);
    if (isRuleError(result)) expect(result.code).toBe("DISTANCE_RULE");
  });

  it("grants starting resources only on the second settlement", () => {
    const state = twoPlayerGame();
    const hexA = state.board.tiles[0]!.hex;
    const vertexA = verticesOfHex(hexA)[0]!;

    const s1 = apply(state, { type: "PLACE_SETTLEMENT", playerId: "a", vertex: vertexA });
    // No resources on first settlement.
    expect(s1.events.some((e) => e.type === "STARTING_RESOURCES_GRANTED")).toBe(false);
    const a1 = s1.state.players.find((p) => p.id === "a")!;
    expect(a1.hand).toEqual({ wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 });
  });
});
