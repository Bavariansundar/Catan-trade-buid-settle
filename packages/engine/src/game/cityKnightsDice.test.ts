import { describe, expect, it } from "vitest";
import { verticesOfHex } from "../coordinates.js";
import { createRngFromState } from "../rng.js";
import { moveRobber, validateMoveRobber } from "./robber.js";
import { EVENT_DIE_FACES, rollDiceWithEvents } from "./cityKnightsDice.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";

const V_P1_CITY = verticesOfHex(TEST_HEX.nw)[0]!; // sheep, number 4

function findRngStateFor(total: number, faceIndex: number): number {
  for (let candidate = 0; candidate < 500_000; candidate++) {
    const rng = createRngFromState(candidate);
    const d1 = rng.int(1, 7);
    const d2 = rng.int(1, 7);
    const face = rng.int(0, EVENT_DIE_FACES.length);
    if (d1 + d2 === total && face === faceIndex) return candidate;
  }
  throw new Error(`No rngState found for total=${String(total)} face index=${String(faceIndex)}`);
}

const TRADE_FACE_INDEX = EVENT_DIE_FACES.indexOf("trade");
const BARBARIAN_FACE_INDEX = EVENT_DIE_FACES.indexOf("barbarian");

describe("rollDiceWithEvents — production + commodities", () => {
  it("produces commodities from a city on a commodity hex on a non-7 roll", () => {
    const rngState = findRngStateFor(4, TRADE_FACE_INDEX);
    const state = testGameState({
      rngState,
      buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "city" }]]),
      commodityBank: { cloth: 10, coin: 10, paper: 10 },
    });
    const result = rollDiceWithEvents(state, "p1");
    expect(result.state.diceRoll![0] + result.state.diceRoll![1]).toBe(4);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.sheep).toBe(1);
    expect(result.state.players.find((p) => p.id === "p1")!.commodities.cloth).toBe(1);
    expect(result.state.phase).toEqual({ name: "main" });
  });
});

describe("rollDiceWithEvents — event die: progress card draws", () => {
  it("draws a trade-deck card for every player with trade level >= 1", () => {
    const rngState = findRngStateFor(8, TRADE_FACE_INDEX);
    const state = testGameState({
      rngState,
      tradeDeck: ["bazaar"],
      players: testGameState().players.map((p) =>
        p.id === "p1" ? { ...p, cityImprovements: { trade: 1, politics: 0, science: 0 } } : p,
      ),
    });
    const result = rollDiceWithEvents(state, "p1");
    expect(result.events.some((e) => e.type === "PROGRESS_CARD_DRAWN")).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.progressCards).toEqual([
      { type: "bazaar" },
    ]);
    expect(result.state.tradeDeck).toEqual([]);
  });
});

describe("rollDiceWithEvents — event die: barbarian advance", () => {
  it("advances the barbarian track on a non-7 roll without disturbing the main phase", () => {
    const rngState = findRngStateFor(8, BARBARIAN_FACE_INDEX);
    const state = testGameState({ rngState, barbarianTrackPosition: 0 });
    const result = rollDiceWithEvents(state, "p1");
    expect(result.state.barbarianTrackPosition).toBe(1);
    expect(result.state.phase).toEqual({ name: "main" });
  });

  it("resolves the attack immediately when the threshold is reached on a non-7 roll", () => {
    const rngState = findRngStateFor(8, BARBARIAN_FACE_INDEX);
    const state = testGameState({
      rngState,
      barbarianTrackPosition: 5, // 2 players -> threshold 6
      buildings: new Map([[V_P1_CITY.id, { playerId: "p1", type: "city" }]]),
      knights: new Map(),
    });
    const result = rollDiceWithEvents(state, "p1");
    expect(result.state.barbarianTrackPosition).toBe(0);
    // p1 is the only city owner and has no knights, so defense (0) < strength (1): loses their lone city.
    expect(result.state.phase).toEqual({ name: "main" });
    expect(result.state.buildings.get(V_P1_CITY.id)).toEqual({
      playerId: "p1",
      type: "settlement",
    });
  });
});

describe("rollDiceWithEvents — a 7 defers a same-roll barbarian tribute until the robber resolves", () => {
  it("keeps the discard/robber phase active, then enters barbarianTribute once MOVE_ROBBER resolves", () => {
    const rngState = findRngStateFor(7, BARBARIAN_FACE_INDEX);
    const V_P1_CITY_2 = verticesOfHex(TEST_HEX.e)[3]!;
    const state = testGameState({
      rngState,
      barbarianTrackPosition: 5,
      buildings: new Map([
        [V_P1_CITY.id, { playerId: "p1", type: "city" }],
        [V_P1_CITY_2.id, { playerId: "p1", type: "city" }], // 2 cities => a real choice is owed
      ]),
      knights: new Map(),
    });
    const result = rollDiceWithEvents(state, "p1");

    // The 7 has no one over the hand-size threshold here, so it goes straight to "robber" —
    // and the barbarian tribute (p1 owes 1 of their 2 cities) must NOT preempt it.
    expect(result.state.phase).toEqual({ name: "robber" });
    expect(result.state.deferredBarbarianTribute).toEqual(new Map([["p1", 1]]));
    // No downgrade has happened yet.
    expect(result.state.buildings.get(V_P1_CITY.id)).toEqual({ playerId: "p1", type: "city" });

    expect(validateMoveRobber(result.state, "p1", TEST_HEX.e, null)).toBeNull();
    const afterRobber = moveRobber(result.state, "p1", TEST_HEX.e, null);
    expect(afterRobber.state.phase).toMatchObject({ name: "barbarianTribute" });
    expect(afterRobber.state.deferredBarbarianTribute).toBeNull();
  });
});
