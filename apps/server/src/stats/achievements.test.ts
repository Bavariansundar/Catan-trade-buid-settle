import type { GameStats } from "./aggregateGameStats.js";
import { ACHIEVEMENTS, evaluateAchievements } from "./achievements.js";

function baseStats(overrides: Partial<GameStats> = {}): GameStats {
  return {
    diceFrequency: {},
    resourcesGainedPerPlayer: {},
    resourcesSpentPerPlayer: {},
    tradesPerPlayer: {},
    vpProgression: [],
    awardTurnsHeld: {},
    settlementsBuiltPerPlayer: {},
    citiesBuiltPerPlayer: {},
    resourcesStolenPerPlayer: {},
    discardsPerPlayer: {},
    sevensRolledPerPlayer: {},
    finalLongestRoadHolder: null,
    finalLargestArmyHolder: null,
    winnerId: null,
    ...overrides,
  };
}

describe("ACHIEVEMENTS", () => {
  it("defines exactly 10 achievements with unique ids", () => {
    expect(ACHIEVEMENTS).toHaveLength(10);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(10);
  });
});

describe("evaluateAchievements", () => {
  it("unlocks first_win only for the winner on their first win", () => {
    const stats = baseStats({ winnerId: "a" });
    expect(evaluateAchievements(stats, "a", 1)).toContain("first_win");
    expect(evaluateAchievements(stats, "b", 0)).not.toContain("first_win");
  });

  it("unlocks ten_wins only once the winner's career total reaches 10", () => {
    const stats = baseStats({ winnerId: "a" });
    expect(evaluateAchievements(stats, "a", 9)).not.toContain("ten_wins");
    expect(evaluateAchievements(stats, "a", 10)).toContain("ten_wins");
  });

  it("unlocks longest_road_master / largest_army_commander for whoever held them at game end", () => {
    const stats = baseStats({ finalLongestRoadHolder: "a", finalLargestArmyHolder: "b" });
    expect(evaluateAchievements(stats, "a", 0)).toContain("longest_road_master");
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("largest_army_commander");
    expect(evaluateAchievements(stats, "b", 0)).toContain("largest_army_commander");
  });

  it("unlocks trade_baron at 10+ trades, not below", () => {
    const stats = baseStats({ tradesPerPlayer: { a: 9, b: 10 } });
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("trade_baron");
    expect(evaluateAchievements(stats, "b", 0)).toContain("trade_baron");
  });

  it("unlocks lucky_seven at 5+ personal natural-7 rolls", () => {
    const stats = baseStats({ sevensRolledPerPlayer: { a: 4, b: 5 } });
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("lucky_seven");
    expect(evaluateAchievements(stats, "b", 0)).toContain("lucky_seven");
  });

  it("unlocks settler at 4+ settlements built and city_builder at all 4 cities", () => {
    const stats = baseStats({
      settlementsBuiltPerPlayer: { a: 3, b: 4 },
      citiesBuiltPerPlayer: { a: 3, b: 4 },
    });
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("settler");
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("city_builder");
    expect(evaluateAchievements(stats, "b", 0)).toContain("settler");
    expect(evaluateAchievements(stats, "b", 0)).toContain("city_builder");
  });

  it("unlocks robber_baron at 5+ resources stolen", () => {
    const stats = baseStats({ resourcesStolenPerPlayer: { a: 4, b: 5 } });
    expect(evaluateAchievements(stats, "a", 0)).not.toContain("robber_baron");
    expect(evaluateAchievements(stats, "b", 0)).toContain("robber_baron");
  });

  it("unlocks flawless_victory only for a winner who never discarded", () => {
    const stats = baseStats({ winnerId: "a", discardsPerPlayer: { a: 0, b: 0 } });
    expect(evaluateAchievements(stats, "a", 0)).toContain("flawless_victory");

    const withDiscard = baseStats({ winnerId: "a", discardsPerPlayer: { a: 1 } });
    expect(evaluateAchievements(withDiscard, "a", 0)).not.toContain("flawless_victory");

    const notWinner = baseStats({ winnerId: "b", discardsPerPlayer: { a: 0 } });
    expect(evaluateAchievements(notWinner, "a", 0)).not.toContain("flawless_victory");
  });
});
