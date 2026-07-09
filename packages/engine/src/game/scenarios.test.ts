import { describe, expect, it } from "vitest";
import { hexKey } from "../coordinates.js";
import { generateBoard } from "../board/generate.js";
import { validateBoard } from "../board/validate.js";
import {
  boardSpecForScenario,
  SCATTERED_ARCHIPELAGO,
  THE_STRAIT,
  TWIN_ISLES,
  type ScenarioDefinition,
} from "./scenarios.js";

const SCENARIOS: readonly ScenarioDefinition[] = [TWIN_ISLES, THE_STRAIT, SCATTERED_ARCHIPELAGO];

describe.each(SCENARIOS)("scenario: $id", (scenario) => {
  it("known hex count matches the known terrain bag", () => {
    expect(scenario.knownTerrainBag).toHaveLength(scenario.knownHexes.length);
  });

  it("known number bag matches the non-desert known hex count", () => {
    const nonDesert = scenario.knownTerrainBag.filter((t) => t !== "desert").length;
    expect(scenario.knownNumberBag).toHaveLength(nonDesert);
  });

  it("discovery bag matches the hidden hex count", () => {
    expect(scenario.discoveryBag).toHaveLength(scenario.hiddenLandHexes.length);
  });

  it("land (known + hidden), sea, and off-map hexes never overlap", () => {
    const known = new Set(scenario.knownHexes.map(hexKey));
    const hidden = new Set(scenario.hiddenLandHexes.map(hexKey));
    const sea = new Set(scenario.seaHexes.map(hexKey));
    for (const key of known) {
      expect(hidden.has(key)).toBe(false);
      expect(sea.has(key)).toBe(false);
    }
    for (const key of hidden) {
      expect(sea.has(key)).toBe(false);
    }
    // No duplicates within any single list.
    expect(known.size).toBe(scenario.knownHexes.length);
    expect(hidden.size).toBe(scenario.hiddenLandHexes.length);
    expect(sea.size).toBe(scenario.seaHexes.length);
  });

  it("homeIslandHexes is a subset of the known hexes", () => {
    const known = new Set(scenario.knownHexes.map(hexKey));
    for (const hex of scenario.homeIslandHexes) {
      expect(known.has(hexKey(hex))).toBe(true);
    }
  });

  it("pirateStartHex is one of the scenario's sea hexes", () => {
    const sea = new Set(scenario.seaHexes.map(hexKey));
    expect(sea.has(hexKey(scenario.pirateStartHex))).toBe(true);
  });

  it("the known portion generates a valid board via the shared shuffle algorithm", () => {
    const spec = boardSpecForScenario(scenario);
    const board = generateBoard(spec, { seed: `scenario-test-${scenario.id}` });
    expect(validateBoard(board, spec)).toEqual([]);
  });
});
