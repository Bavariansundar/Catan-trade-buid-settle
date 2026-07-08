/**
 * Seeded, injectable, replayable RNG. All engine randomness (board
 * generation, dev card shuffling, MCTS determinization, dice rolls, robber
 * steals) must go through this so games can be replayed exactly from their
 * seed + action log.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max). */
  int(min: number, max: number): number;
  /** Current internal state, for persisting into GameState between calls. */
  getState(): number;
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

/** Normalizes a seed (numeric or string) to the 32-bit unsigned int internal RNG state. */
export function normalizeSeed(seed: number | string): number {
  return typeof seed === "string" ? hashStringSeed(seed) : seed >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG, one step. */
function mulberry32Step(state: number): { value: number; nextState: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

/** Builds an {@link Rng} that starts from a raw internal state (no seed hashing). */
export function createRngFromState(state: number): Rng {
  let a = state >>> 0;
  const next = (): number => {
    const { value, nextState } = mulberry32Step(a);
    a = nextState;
    return value;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min));
    },
    getState(): number {
      return a;
    },
  };
}

export function createRng(seed: number | string): Rng {
  return createRngFromState(normalizeSeed(seed));
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
