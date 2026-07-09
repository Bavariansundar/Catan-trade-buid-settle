import { describe, expect, it } from "vitest";
import { verticesOfHex } from "../coordinates.js";
import {
  advanceBarbarianTrack,
  barbarianAttackThreshold,
  chooseCityToDowngrade,
  resolveBarbarianAttack,
  validateChooseCityToDowngrade,
} from "./barbarians.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_P1_CITY = verticesOfHex(TEST_HEX.center)[0]!;
const V_P1_CITY_2 = verticesOfHex(TEST_HEX.e)[3]!;
const V_P2_CITY = verticesOfHex(TEST_HEX.w)[0]!;

describe("barbarianAttackThreshold", () => {
  it("scales 3x with player count", () => {
    expect(barbarianAttackThreshold(2)).toBe(6);
    expect(barbarianAttackThreshold(4)).toBe(12);
    expect(barbarianAttackThreshold(6)).toBe(18);
  });
});

describe("advanceBarbarianTrack", () => {
  it("advances by 1 without resolving an attack below the threshold", () => {
    const state = testGameState({ barbarianTrackPosition: 0 });
    const result = advanceBarbarianTrack(state);
    expect(result.state.barbarianTrackPosition).toBe(1);
    expect(result.events).toEqual([{ type: "BARBARIAN_ADVANCED", position: 1 }]);
  });

  it("resolves an attack and resets to 0 at the threshold (2 players -> 6)", () => {
    const state = testGameState({ barbarianTrackPosition: 5 });
    const result = advanceBarbarianTrack(state);
    expect(result.state.barbarianTrackPosition).toBe(0);
    expect(
      result.events.some(
        (e) => e.type === "BARBARIAN_ATTACK_DEFENDED" || e.type === "BARBARIAN_ATTACK_LOST",
      ),
    ).toBe(true);
  });
});

describe("resolveBarbarianAttack — successful defense", () => {
  it("rewards the strict top defender(s) with +1 VP each, ties included", () => {
    const state = testGameState({
      buildings: new Map(), // 0 cities => strength 0, any defense (even 0) wins
      knights: new Map([
        [V_P1_CITY.id, { playerId: "p1", level: 2 as const, active: true }],
        [V_P2_CITY.id, { playerId: "p2", level: 2 as const, active: true }],
      ]),
    });
    const result = resolveBarbarianAttack(state);
    const event = result.events[0];
    expect(event).toMatchObject({ type: "BARBARIAN_ATTACK_DEFENDED" });
    expect(
      event && "rewardedPlayerIds" in event ? [...event.rewardedPlayerIds].sort() : [],
    ).toEqual(["p1", "p2"]);
    expect(result.state.players.find((p) => p.id === "p1")!.barbarianDefenseWins).toBe(1);
    expect(result.state.players.find((p) => p.id === "p2")!.barbarianDefenseWins).toBe(1);
  });

  it("rewards nobody when total defense is 0 (still >= strength 0, but no active knights to credit)", () => {
    const state = testGameState({ buildings: new Map(), knights: new Map() });
    const result = resolveBarbarianAttack(state);
    expect(result.events).toEqual([{ type: "BARBARIAN_ATTACK_DEFENDED", rewardedPlayerIds: [] }]);
  });
});

describe("resolveBarbarianAttack — failed defense", () => {
  it("auto-downgrades a lone city for a losing player who owns exactly one", () => {
    const state = testGameState({
      buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "city" }]]),
      knights: new Map(),
    });
    const result = resolveBarbarianAttack(state);
    expect(result.events.some((e) => e.type === "BARBARIAN_ATTACK_LOST")).toBe(true);
    expect(result.events.some((e) => e.type === "CITY_DOWNGRADED")).toBe(true);
    expect(result.state.buildings.get(V_P1_CITY.id)).toEqual({
      playerId: "p1",
      type: "settlement",
    });
    expect(result.state.phase).toEqual({ name: "main" });
  });

  it("queues a barbarianTribute phase for a losing player who owns more than one city", () => {
    const state = testGameState({
      buildings: new Map([
        [V_P1_CITY.id, { playerId: "p1", type: "city" }],
        [V_P1_CITY_2.id, { playerId: "p1", type: "city" }],
      ]),
      knights: new Map(),
    });
    const result = resolveBarbarianAttack(state);
    expect(result.state.phase).toMatchObject({ name: "barbarianTribute" });
    if (result.state.phase.name === "barbarianTribute") {
      expect(result.state.phase.pending.get("p1")).toBe(1);
    }
  });

  it("only the fewest-defense player(s) lose, not everyone with a city", () => {
    const state = testGameState({
      buildings: new Map([
        [V_P1_CITY.id, { playerId: "p1", type: "city" }],
        [V_P2_CITY.id, { playerId: "p2", type: "city" }],
      ]),
      knights: new Map([[V_P1_CITY.id, { playerId: "p1", level: 1 as const, active: true }]]),
    });
    const result = resolveBarbarianAttack(state);
    const lostEvent = result.events.find((e) => e.type === "BARBARIAN_ATTACK_LOST");
    expect(lostEvent).toMatchObject({ losingPlayerIds: ["p2"] });
    expect(result.state.buildings.get(V_P1_CITY.id)).toEqual({ playerId: "p1", type: "city" });
    expect(result.state.buildings.get(V_P2_CITY.id)).toEqual({
      playerId: "p2",
      type: "settlement",
    });
  });
});

describe("validateChooseCityToDowngrade / chooseCityToDowngrade", () => {
  it("resolves the tribute phase back to main once every pending player has chosen", () => {
    const state = testGameState({
      buildings: new Map([
        [V_P1_CITY.id, { playerId: "p1", type: "city" }],
        [V_P1_CITY_2.id, { playerId: "p1", type: "city" }],
      ]),
      phase: { name: "barbarianTribute", pending: new Map([["p1", 1]]) },
    });
    const action = { type: "CHOOSE_CITY_TO_DOWNGRADE" as const, playerId: "p1", vertex: V_P1_CITY };
    expect(validateChooseCityToDowngrade(state, action)).toBeNull();
    const result = chooseCityToDowngrade(state, action);
    expect(result.state.phase).toEqual({ name: "main" });
    expect(result.state.buildings.get(V_P1_CITY.id)).toEqual({
      playerId: "p1",
      type: "settlement",
    });
  });

  it("rejects choosing a city the player doesn't own", () => {
    const state = testGameState({
      buildings: new Map([[V_P2_CITY.id, { playerId: "p2", type: "city" }]]),
      phase: { name: "barbarianTribute", pending: new Map([["p1", 1]]) },
    });
    const action = { type: "CHOOSE_CITY_TO_DOWNGRADE" as const, playerId: "p1", vertex: V_P2_CITY };
    expect(validateChooseCityToDowngrade(state, action)).toMatchObject({ code: "NOT_YOUR_CITY" });
  });
});
