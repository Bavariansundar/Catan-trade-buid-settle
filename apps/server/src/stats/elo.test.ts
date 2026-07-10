import { DEFAULT_RATING, updateRatings } from "./elo.js";

describe("updateRatings", () => {
  it("defaults unrated players to DEFAULT_RATING and moves the winner up, everyone else down", () => {
    const after = updateRatings({}, ["a", "b"], "a");
    expect(after["a"]).toBeGreaterThan(DEFAULT_RATING);
    expect(after["b"]).toBeLessThan(DEFAULT_RATING);
    // Zero-sum for an even 2-player matchup (equal ratings before the game).
    expect(after["a"]! - DEFAULT_RATING).toBe(DEFAULT_RATING - after["b"]!);
  });

  it("moves ratings less when the winner was already heavily favored", () => {
    const evenMatch = updateRatings({ a: 1200, b: 1200 }, ["a", "b"], "a");
    const lopsidedMatch = updateRatings({ a: 1600, b: 1200 }, ["a", "b"], "a");
    const evenGain = evenMatch["a"]! - 1200;
    const lopsidedGain = lopsidedMatch["a"]! - 1600;
    expect(lopsidedGain).toBeLessThan(evenGain);
    expect(lopsidedGain).toBeGreaterThanOrEqual(0);
  });

  it("treats the winner as beating every other player pairwise in a multiplayer game", () => {
    const after = updateRatings({ a: 1200, b: 1200, c: 1200, d: 1200 }, ["a", "b", "c", "d"], "a");
    expect(after["a"]).toBeGreaterThan(1200);
    expect(after["b"]).toBeLessThan(1200);
    expect(after["c"]).toBeLessThan(1200);
    expect(after["d"]).toBeLessThan(1200);
    // Symmetric field, so every loser drops by the same amount.
    expect(after["b"]).toBe(after["c"]);
    expect(after["c"]).toBe(after["d"]);
  });

  it("preserves existing ratings for players not in this game", () => {
    const after = updateRatings({ a: 1400, b: 1000, z: 9999 }, ["a", "b"], "a");
    expect(after["z"]).toBeUndefined();
  });
});
