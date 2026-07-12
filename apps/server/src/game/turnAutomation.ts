import { HeuristicBot, MCTSBot, RuleBasedBot, sensibleDiscard, type Bot } from "@baychearsbar/bots";
import type { Action, GameState, PlayerId, RuleModule } from "@baychearsbar/engine";
import type { BotDifficulty } from "../domain/types.js";

export function createBotForDifficulty(difficulty: BotDifficulty): Bot {
  switch (difficulty) {
    case "EASY":
      return new RuleBasedBot();
    case "MEDIUM":
      return new HeuristicBot();
    case "HARD":
      return new MCTSBot();
  }
}

/**
 * Fast, safe, predictable default for turn-timer expiry and disconnect
 * takeover — always `RuleBasedBot`, regardless of a human seat's normal
 * difficulty preference (that setting only applies to *bot seats*). See
 * docs/architecture/server.md open question #3 (approved as proposed).
 */
export function autoPilotBot(): Bot {
  return new RuleBasedBot();
}

/**
 * A connected-but-idle player's turn-timer expiry: "auto-pass/auto-discard"
 * per PROMPTS.md Phase 8, literally — end the turn or discard sensibly
 * rather than have a bot spend their resources/build on their behalf. Phases
 * with no "do nothing" option (rolling, the robber, setup, a barbarian
 * tribute choice) fall back to a real decision via {@link autoPilotBot}
 * since there's no passive action to take there.
 */
export function autoResolveTimeout(
  state: GameState,
  playerId: PlayerId,
  modules: readonly RuleModule[],
): Action {
  if (state.phase.name === "main") return { type: "END_TURN", playerId };
  if (state.phase.name === "specialBuild") return { type: "PASS_SPECIAL_BUILD", playerId };
  if (state.phase.name === "discard") {
    const owed = state.phase.pending.get(playerId) ?? 0;
    const player = state.players.find((p) => p.id === playerId)!;
    return { type: "DISCARD", playerId, resources: sensibleDiscard(player.hand, owed) };
  }
  return autoPilotBot().chooseAction(state, playerId, modules);
}
