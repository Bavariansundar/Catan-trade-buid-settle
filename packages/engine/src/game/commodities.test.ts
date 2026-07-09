import { describe, expect, it } from "vitest";
import { verticesOfHex } from "../coordinates.js";
import { computeProductionWithCommodities } from "./commodities.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

describe("computeProductionWithCommodities", () => {
  it("gives a settlement only the base resource, even on a commodity hex", () => {
    const vertex = verticesOfHex(TEST_HEX.nw)[0]!; // sheep, number 4
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "settlement" }]]),
    });
    const { resources, commodities } = computeProductionWithCommodities(state, 4);
    expect(resources.get("p1")).toEqual({ sheep: 1 });
    expect(commodities.get("p1")).toBeUndefined();
  });

  it("gives a city on a sheep/ore/wood hex 1 resource + 1 commodity instead of 2 resource", () => {
    const vertex = verticesOfHex(TEST_HEX.nw)[0]!; // sheep, number 4
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]),
      commodityBank: { cloth: 10, coin: 10, paper: 10 },
    });
    const { resources, commodities } = computeProductionWithCommodities(state, 4);
    expect(resources.get("p1")).toEqual({ sheep: 1 });
    expect(commodities.get("p1")).toEqual({ cloth: 1 });
  });

  it("gives a city on a brick/wheat hex the normal 2 resource, no commodity", () => {
    const vertex = verticesOfHex(TEST_HEX.w)[0]!; // brick, number 3
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]),
    });
    const { resources, commodities } = computeProductionWithCommodities(state, 3);
    expect(resources.get("p1")).toEqual({ brick: 2 });
    expect(commodities.get("p1")).toBeUndefined();
  });

  it("withholds a commodity from everyone when demand exceeds the commodity bank", () => {
    const v1 = verticesOfHex(TEST_HEX.nw)[0]!;
    const v2 = verticesOfHex(TEST_HEX.nw)[2]!;
    const state = testGameState({
      buildings: new Map([
        [v1.id, { playerId: "p1", type: "city" }],
        [v2.id, { playerId: "p2", type: "city" }],
      ]),
      commodityBank: { cloth: 1, coin: 10, paper: 10 },
    });
    const { commodities } = computeProductionWithCommodities(state, 4);
    expect(commodities.size).toBe(0);
  });

  it("robber on the hex blocks all production from it, resources and commodities alike", () => {
    const vertex = verticesOfHex(TEST_HEX.nw)[0]!;
    const state = testGameState({
      buildings: new Map([[vertex.id, { playerId: "p1", type: "city" }]]),
      robber: TEST_HEX.nw,
    });
    const { resources, commodities } = computeProductionWithCommodities(state, 4);
    expect(resources.size).toBe(0);
    expect(commodities.size).toBe(0);
  });
});
