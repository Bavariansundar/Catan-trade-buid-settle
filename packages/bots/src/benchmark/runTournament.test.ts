import { describe, expect, it } from "vitest";
import { runTournamentSequential } from "./runTournament.js";
import type { BotSpec } from "./botSpec.js";

describe("runTournamentSequential", () => {
  it("tallies wins/incomplete and alternates seats across games", () => {
    const ruleBased: BotSpec = { tier: "ruleBased" };
    const heuristic: BotSpec = { tier: "heuristic" };
    const result = runTournamentSequential(heuristic, ruleBased, 6, "seq-test");
    expect(result.games).toBe(6);
    expect(result.aWins + result.bWins + result.incomplete).toBe(6);
    expect(result.incomplete).toBe(0);
    expect(result.aWinRate).toBeGreaterThan(0);
  }, 60_000);

  it("is deterministic for the same seed prefix", () => {
    const a: BotSpec = { tier: "ruleBased" };
    const b: BotSpec = { tier: "ruleBased" };
    const first = runTournamentSequential(a, b, 4, "seq-determinism");
    const second = runTournamentSequential(a, b, 4, "seq-determinism");
    expect(second).toEqual(first);
  }, 30_000);
});
