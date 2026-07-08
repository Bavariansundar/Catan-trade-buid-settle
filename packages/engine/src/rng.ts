/**
 * Seeded, injectable, replayable RNG. All engine randomness (board
 * generation, dev card shuffling, MCTS determinization) must go through
 * this so games can be replayed exactly from their seed + action log.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max). */
  int(min: number, max: number): number;
}

/** Hashes an arbitrary string seed down to a 32-bit unsigned int (cyrb53-lite). */
function hashStringSeed(seed: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number | string): Rng {
  const numericSeed = typeof seed === "string" ? hashStringSeed(seed) : seed >>> 0;
  const next = mulberry32(numericSeed);
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min));
    },
  };
}

/** Fisher–Yates shuffle. Pure: returns a new array, never mutates `items`. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
