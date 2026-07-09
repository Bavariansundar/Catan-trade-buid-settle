import { findActionHandler, type RuleModule } from "./module.js";
import type { Action, ApplyResult } from "./types.js";
import type { GameState } from "./types.js";

/**
 * The engine's single entry point: validates `action` against `state` and,
 * if legal, returns the resulting state + emitted events. Never mutates
 * `state`. All randomness is drawn from `state.rngState`, so replaying the
 * same action log from the same initial state is deterministic.
 *
 * `modules` is the active module list for this game (base always first —
 * see docs/architecture/modules.md); the dispatcher itself is generic, it
 * just looks up whichever module owns `action.type` and calls its handler.
 */
export function applyAction(
  modules: readonly RuleModule[],
  state: GameState,
  action: Action,
): ApplyResult {
  const handler = findActionHandler(modules, action.type);
  if (!handler) {
    return {
      code: "UNKNOWN_ACTION",
      message: `No active module handles action type ${action.type}`,
    };
  }
  return handler(state, action, modules);
}
