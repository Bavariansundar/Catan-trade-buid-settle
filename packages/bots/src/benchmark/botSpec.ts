import { createRng } from "@hexhaven/engine";
import { HeuristicBot } from "../heuristicBot.js";
import { MCTSBot } from "../mctsBot.js";
import { RuleBasedBot } from "../ruleBasedBot.js";
import type { Bot } from "../types.js";

/**
 * A plain-object description of a bot, safe to pass across a worker_threads
 * boundary (structured-clonable — a live `Bot` instance, with its RNG
 * closures, is not). `buildBot` turns one back into a real `Bot` inside
 * whichever thread will actually run it.
 */
export type BotSpec =
  | { readonly tier: "ruleBased" }
  | { readonly tier: "heuristic" }
  | { readonly tier: "mcts"; readonly timeBudgetMs: number; readonly rngSeed: number | string };

export function botSpecLabel(spec: BotSpec): string {
  switch (spec.tier) {
    case "ruleBased":
      return "RuleBasedBot";
    case "heuristic":
      return "HeuristicBot";
    case "mcts":
      return `MCTSBot(${String(spec.timeBudgetMs)}ms)`;
  }
}

export function buildBot(spec: BotSpec): Bot {
  switch (spec.tier) {
    case "ruleBased":
      return new RuleBasedBot();
    case "heuristic":
      return new HeuristicBot();
    case "mcts":
      return new MCTSBot({ timeBudgetMs: spec.timeBudgetMs, rng: createRng(spec.rngSeed) });
  }
}
