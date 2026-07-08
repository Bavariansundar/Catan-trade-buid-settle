import { describe, expect, it } from "vitest";
import { createRng, shuffle } from "./rng.js";

describe("createRng", () => {
  it("is deterministic: same numeric seed produces the same sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("is deterministic: same string seed produces the same sequence", () => {
    const a = createRng("hexhaven-game-1");
    const b = createRng("hexhaven-game-1");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() always returns a value in [0, 1)", () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int(min, max) always returns a value in [min, max)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(2, 12);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThan(12);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("shuffle", () => {
  it("returns a permutation of the input (same multiset of elements)", () => {
    const rng = createRng(99);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(input, rng);
    expect(result).toHaveLength(input.length);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it("does not mutate the input array", () => {
    const rng = createRng(99);
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, rng);
    expect(input).toEqual(copy);
  });

  it("is deterministic for a given seed", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const resultA = shuffle(input, createRng("shuffle-seed"));
    const resultB = shuffle(input, createRng("shuffle-seed"));
    expect(resultA).toEqual(resultB);
  });

  it("produces different orderings for different seeds (statistically)", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const resultA = shuffle(input, createRng(1));
    const resultB = shuffle(input, createRng(2));
    expect(resultA).not.toEqual(resultB);
  });
});
