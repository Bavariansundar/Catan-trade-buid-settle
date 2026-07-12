import { describe, expect, it } from "vitest";
import { BASE_MODULE, verticesOfHex, type GameState, type RuleModule } from "@baychearsbar/engine";
import { testGameStateForBots } from "./testHelpers.js";
import { evaluateState } from "./evaluate.js";

const MODULES: readonly RuleModule[] = [BASE_MODULE];

describe("evaluateState", () => {
  it("increases when a settlement is upgraded to a city on the same spot", () => {
    const vertex = verticesOfHex({ q: 0, r: 0 })[0]!;
    const withSettlement = testGameStateForBots({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    });
    const withCity: GameState = {
      ...withSettlement,
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]),
    };
    expect(evaluateState(MODULES, withCity, "p1")).toBeGreaterThan(
      evaluateState(MODULES, withSettlement, "p1"),
    );
  });

  it("penalizes the robber sitting on the player's own production hex", () => {
    const hex = { q: 0, r: 0 };
    const vertex = verticesOfHex(hex)[0]!;
    const base = testGameStateForBots({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
      robber: { q: 5, r: 5 },
    });
    const robbed: GameState = { ...base, robber: hex };
    expect(evaluateState(MODULES, robbed, "p1")).toBeLessThan(evaluateState(MODULES, base, "p1"));
  });

  it("rewards more production pips (a higher-probability number touching an owned settlement)", () => {
    const lowNumberBoard = testGameStateForBots({}, { number: 2 });
    const highNumberBoard = testGameStateForBots({}, { number: 6 });
    const vertex = verticesOfHex({ q: 0, r: 0 })[0]!;
    const lowState: GameState = {
      ...lowNumberBoard,
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    };
    const highState: GameState = {
      ...highNumberBoard,
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    };
    expect(evaluateState(MODULES, highState, "p1")).toBeGreaterThan(
      evaluateState(MODULES, lowState, "p1"),
    );
  });
});
