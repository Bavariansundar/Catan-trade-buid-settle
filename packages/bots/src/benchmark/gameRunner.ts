import { applyAction, BASE_MODULE, createGame, isRuleError } from "@baychearsbar/engine";
import { resolveActingPlayerId } from "../turnHelpers.js";
import { buildBot, type BotSpec } from "./botSpec.js";

const MODULES = [BASE_MODULE];
/** Generous safety cap — real games finish in well under this many actions. */
const MAX_ACTIONS = 4000;

export type MatchResult = "A" | "B" | "incomplete";

/**
 * Plays one full 2-player game between `specA` (seat "A") and `specB` (seat
 * "B"), alternating which seat goes first via `swapSeats` so a tournament
 * can cancel out first-player advantage across its games. Returns which
 * spec won, or "incomplete" if `MAX_ACTIONS` was hit (a bug, not expected
 * in normal play — surfaced so the tournament runner can flag it loudly
 * rather than silently miscounting a win).
 */
export function playOneMatch(
  specA: BotSpec,
  specB: BotSpec,
  seed: number | string,
  swapSeats: boolean,
): MatchResult {
  const seatA = swapSeats ? "B" : "A";
  const seatB = swapSeats ? "A" : "B";
  const bots = { [seatA]: buildBot(specA), [seatB]: buildBot(specB) };

  let state = createGame(MODULES, { playerIds: ["A", "B"], seed });
  for (let i = 0; i < MAX_ACTIONS; i++) {
    if (state.phase.name === "ended") {
      return state.phase.winner === seatA ? "A" : "B";
    }
    const actingPlayerId = resolveActingPlayerId(state);
    const action = bots[actingPlayerId]!.chooseAction(state, actingPlayerId, MODULES);
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) {
      throw new Error(
        `${bots[actingPlayerId]!.name} proposed an illegal action ${action.type} for seat ${actingPlayerId} (seed ${String(seed)}): ${result.code} — ${result.message}`,
      );
    }
    state = result.state;
  }
  return "incomplete";
}
