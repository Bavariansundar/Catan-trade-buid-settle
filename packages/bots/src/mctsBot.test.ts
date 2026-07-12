import { describe, expect, it } from "vitest";
import {
  applyAction,
  BASE_MODULE,
  createGame,
  createRng,
  isRuleError,
  type GameState,
} from "@baychearsbar/engine";
import { MCTSBot } from "./mctsBot.js";
import { resolveActingPlayerId } from "./turnHelpers.js";
import type { Bot } from "./types.js";

const MODULES = [BASE_MODULE];

function playFullGame(
  bots: Record<string, Bot>,
  seed: number | string,
  maxActions = 2500,
): GameState {
  let state = createGame(MODULES, { playerIds: Object.keys(bots), seed });
  for (let i = 0; i < maxActions; i++) {
    if (state.phase.name === "ended") return state;
    const actingPlayerId = resolveActingPlayerId(state);
    const action = bots[actingPlayerId]!.chooseAction(state, actingPlayerId, MODULES);
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) {
      throw new Error(
        `${bots[actingPlayerId]!.name} proposed an illegal action ${action.type} for ${actingPlayerId}: ${result.code} — ${result.message}`,
      );
    }
    state = result.state;
  }
  return state;
}

describe("MCTSBot", () => {
  it("never proposes an illegal action across a full 2-player game (small time budget)", () => {
    const bots: Record<string, Bot> = {
      a: new MCTSBot({ timeBudgetMs: 30, rng: createRng("mcts-smoke-rng") }),
      b: new MCTSBot({ timeBudgetMs: 30, rng: createRng("mcts-smoke-rng-2") }),
    };
    const state = playFullGame(bots, "mcts-smoke-1");
    expect(state.phase.name).toBe("ended");
  }, 30_000);

  it("falls back to HeuristicBot's decision-shape when modules aren't fully supported", () => {
    // A minimal contract check: with an unsupported module id present, MCTSBot must not throw
    // trying to run its own search — it should still return *some* legal action.
    const state = createGame(MODULES, { playerIds: ["a", "b"], seed: "mcts-fallback" });
    const fakeModule = { id: "not-really-supported" };
    const bot = new MCTSBot({ timeBudgetMs: 10 });
    const action = bot.chooseAction(state, "a", [BASE_MODULE, fakeModule]);
    expect(action.playerId).toBe("a");
  });
});
