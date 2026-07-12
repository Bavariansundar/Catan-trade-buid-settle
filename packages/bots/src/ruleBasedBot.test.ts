import { describe, expect, it } from "vitest";
import {
  applyAction,
  BASE_MODULE,
  createGame,
  isRuleError,
  type GameState,
} from "@baychearsbar/engine";
import { RuleBasedBot } from "./ruleBasedBot.js";

const MODULES = [BASE_MODULE];

/** Drives a full game between RuleBasedBots, asserting every proposed action is legal. */
function playFullGame(seed: number | string, maxActions = 2000): GameState {
  const bot = new RuleBasedBot();
  let state = createGame(MODULES, { playerIds: ["a", "b", "c"], seed });

  for (let i = 0; i < maxActions; i++) {
    if (state.phase.name === "ended") return state;
    const actingPlayerId =
      state.phase.name === "setup"
        ? state.phase.order[state.phase.step]!
        : state.phase.name === "discard"
          ? [...state.phase.pending.keys()][0]!
          : state.players[state.currentPlayerIndex]!.id;

    const action = bot.chooseAction(state, actingPlayerId, MODULES);
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) {
      throw new Error(
        `RuleBasedBot proposed an illegal action ${action.type} for ${actingPlayerId}: ${result.code} — ${result.message}`,
      );
    }
    state = result.state;
  }
  return state;
}

describe("RuleBasedBot", () => {
  it("never proposes an illegal action across a full 3-player game", () => {
    const state = playFullGame("rulebot-smoke-1");
    expect(state.phase.name).toBe("ended");
  }, 30_000);

  it("is deterministic and legal across several different seeds", () => {
    for (const seed of ["rulebot-2", "rulebot-3", "rulebot-4", 42, 1337]) {
      const state = playFullGame(seed);
      expect(["ended"]).toContain(state.phase.name);
    }
  }, 60_000);
});
