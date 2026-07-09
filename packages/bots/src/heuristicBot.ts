import {
  applyAction,
  isRuleError,
  type Action,
  type GameState,
  type PlayerId,
  type RuleModule,
} from "@hexhaven/engine";
import { evaluateState } from "./evaluate.js";
import { enumerateLegalActions } from "./legalActions.js";
import { RuleBasedBot } from "./ruleBasedBot.js";
import type { Bot } from "./types.js";

/**
 * One-ply lookahead over every legal action: simulate each via the real
 * engine (`applyAction`), score the resulting state with `evaluateState`,
 * and take the best. "roll" and "discard" have no board-shape choice worth
 * scoring this way (there's exactly one sensible roll, and discard is pure
 * hand arithmetic — see ruleBasedBot.ts's `sensibleDiscard`), so those two
 * phases delegate straight to RuleBasedBot rather than doing a pointless
 * lookahead over a single (or purely-arithmetic) candidate.
 */
export class HeuristicBot implements Bot {
  readonly name = "HeuristicBot";
  private readonly fallback = new RuleBasedBot();

  chooseAction(state: GameState, playerId: PlayerId, modules: readonly RuleModule[]): Action {
    if (state.phase.name === "roll" || state.phase.name === "discard") {
      return this.fallback.chooseAction(state, playerId, modules);
    }

    const candidates = enumerateLegalActions(state, playerId, modules);
    if (candidates.length === 0) {
      return this.fallback.chooseAction(state, playerId, modules);
    }
    if (candidates.length === 1) return candidates[0]!;

    let best = candidates[0]!;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = this.scoreCandidate(modules, state, playerId, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  private scoreCandidate(
    modules: readonly RuleModule[],
    state: GameState,
    playerId: PlayerId,
    action: Action,
  ): number {
    const result = applyAction(modules, state, action);
    if (isRuleError(result)) return -Infinity; // shouldn't happen — candidates are pre-validated
    return evaluateState(modules, result.state, playerId);
  }
}
