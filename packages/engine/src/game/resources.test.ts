import { describe, expect, it } from "vitest";
import {
  addHands,
  canAfford,
  emptyHand,
  handTotal,
  subtractHands,
  BUILD_COSTS,
} from "./resources.js";

describe("resource hand helpers", () => {
  it("emptyHand is all zeros", () => {
    expect(emptyHand()).toEqual({ wood: 0, wheat: 0, sheep: 0, brick: 0, ore: 0 });
  });

  it("handTotal sums all resource counts", () => {
    expect(handTotal({ wood: 2, brick: 1 })).toBe(3);
    expect(handTotal(emptyHand())).toBe(0);
  });

  it("addHands adds counts without mutating the input", () => {
    const hand = emptyHand();
    const result = addHands(hand, { wood: 2, ore: 1 });
    expect(result).toEqual({ wood: 2, wheat: 0, sheep: 0, brick: 0, ore: 1 });
    expect(hand).toEqual(emptyHand());
  });

  it("subtractHands subtracts counts without mutating the input", () => {
    const hand = { wood: 3, wheat: 2, sheep: 1, brick: 0, ore: 0 };
    const result = subtractHands(hand, { wood: 1, wheat: 2 });
    expect(result).toEqual({ wood: 2, wheat: 0, sheep: 1, brick: 0, ore: 0 });
    expect(hand).toEqual({ wood: 3, wheat: 2, sheep: 1, brick: 0, ore: 0 });
  });

  it("canAfford is true iff every required resource is covered", () => {
    const hand = { wood: 1, wheat: 1, sheep: 1, brick: 1, ore: 0 };
    expect(canAfford(hand, BUILD_COSTS.settlement)).toBe(true);
    expect(canAfford(hand, BUILD_COSTS.city)).toBe(false);
    expect(canAfford(hand, BUILD_COSTS.road)).toBe(true);
  });
});
