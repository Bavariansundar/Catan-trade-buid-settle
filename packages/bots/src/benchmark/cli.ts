import { runTournament } from "./runTournament.js";
import type { BotSpec } from "./botSpec.js";
import { botSpecLabel } from "./botSpec.js";

/**
 * Standalone benchmark CLI — run via `pnpm --filter @hexhaven/bots bench`
 * (see package.json) after `pnpm build`, since it needs the compiled
 * worker.js (see runTournament.ts's doc). Not part of `pnpm test`: 500+
 * games per pairing, one of which is MCTS, is minutes of wall-clock time —
 * appropriate for a deliberate benchmark run, not every test invocation.
 *
 * Reports win rates for the two pairings PROMPTS.md Phase 7 asks for:
 * HeuristicBot vs RuleBasedBot, and MCTSBot vs HeuristicBot, each needing
 * >60% for the stronger tier.
 */
async function main(): Promise<void> {
  const gamesArg = process.argv.find((a) => a.startsWith("--games="));
  const games = gamesArg ? Number(gamesArg.slice("--games=".length)) : 500;
  const mctsBudgetArg = process.argv.find((a) => a.startsWith("--mcts-ms="));
  const mctsBudgetMs = mctsBudgetArg ? Number(mctsBudgetArg.slice("--mcts-ms=".length)) : 150;

  const ruleBased: BotSpec = { tier: "ruleBased" };
  const heuristic: BotSpec = { tier: "heuristic" };
  const mcts: BotSpec = { tier: "mcts", timeBudgetMs: mctsBudgetMs, rngSeed: "bench-mcts" };

  console.log(
    `Running ${String(games)} games: ${botSpecLabel(heuristic)} vs ${botSpecLabel(ruleBased)}...`,
  );
  const heuristicVsRuleBased = await runTournament(
    heuristic,
    ruleBased,
    games,
    "bench-heuristic-vs-rulebased",
  );
  console.log(
    `  ${botSpecLabel(heuristic)} win rate: ${(heuristicVsRuleBased.aWinRate * 100).toFixed(1)}% ` +
      `(${String(heuristicVsRuleBased.aWins)}/${String(heuristicVsRuleBased.games)}, ${String(heuristicVsRuleBased.incomplete)} incomplete)`,
  );

  console.log(
    `Running ${String(games)} games: ${botSpecLabel(mcts)} vs ${botSpecLabel(heuristic)}...`,
  );
  const mctsVsHeuristic = await runTournament(mcts, heuristic, games, "bench-mcts-vs-heuristic");
  console.log(
    `  ${botSpecLabel(mcts)} win rate: ${(mctsVsHeuristic.aWinRate * 100).toFixed(1)}% ` +
      `(${String(mctsVsHeuristic.aWins)}/${String(mctsVsHeuristic.games)}, ${String(mctsVsHeuristic.incomplete)} incomplete)`,
  );

  const heuristicPassed = heuristicVsRuleBased.aWinRate > 0.6;
  const mctsPassed = mctsVsHeuristic.aWinRate > 0.6;
  console.log("");
  console.log(`HeuristicBot > 60% vs RuleBasedBot: ${heuristicPassed ? "PASS" : "FAIL"}`);
  console.log(`MCTSBot > 60% vs HeuristicBot: ${mctsPassed ? "PASS" : "FAIL"}`);

  if (!heuristicPassed || !mctsPassed) process.exitCode = 1;
}

void main();
