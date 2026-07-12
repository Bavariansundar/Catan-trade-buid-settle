import type { Action, GameState, PlayerId, RuleModule } from "@baychearsbar/engine";

/**
 * A bot decides its next action from the true `GameState` (this package runs
 * server-side/in-process, same as the engine's other callers — see
 * docs/architecture/modules.md). Tiers 1-2 read the true state directly, the
 * simplest correct way to build a working bot for this phase. Tier 3
 * (MCTSBot) deliberately does NOT peek at hidden opponent info when forming
 * its search: it redacts to `viewFor` first and determinizes samples from
 * there, satisfying "hidden information discipline" for the *algorithm*
 * even though the process technically holds the true state.
 */
export interface Bot {
  readonly name: string;
  chooseAction(state: GameState, playerId: PlayerId, modules: readonly RuleModule[]): Action;
}

/**
 * Scope note (see PROMPTS.md Phase 7): all three tiers target the `base`
 * and `five-six-players` modules only — the same closed action surface,
 * just a wider board/bank and an extra special-build phase. Seafarers-style
 * and Cities & Knights-style bring enough new action types (ships, knights,
 * progress cards, ...) that bot support for them is out of scope here;
 * MCTSBot detects this and falls back to HeuristicBot (per the brief's
 * "expansion support can degrade gracefully" allowance). Tiers 1-2 are only
 * ever exercised against base/five-six-players games in this phase.
 *
 * Also out of scope: player-to-player trade negotiation (PROPOSE_TRADE and
 * friends). Modeling *when an opponent would accept an offer* is a
 * meaningfully separate AI problem; bots here rely solely on building,
 * maritime trade, and dev cards. Both cuts are deliberate scope
 * simplifications for this phase, not oversights.
 */
export const BOT_SUPPORTED_MODULE_IDS: ReadonlySet<string> = new Set(["base", "five-six-players"]);

export function isFullySupported(modules: readonly RuleModule[]): boolean {
  return modules.every((m) => BOT_SUPPORTED_MODULE_IDS.has(m.id));
}
