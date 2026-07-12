import { describe, expect, it } from "vitest";
import {
  applyAction,
  BASE_MODULE,
  createGame,
  isRuleError,
  type GameState,
} from "@baychearsbar/engine";
import { HeuristicBot } from "./heuristicBot.js";
import { RuleBasedBot } from "./ruleBasedBot.js";
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
    const actingPlayerId =
      state.phase.name === "setup"
        ? state.phase.order[state.phase.step]!
        : state.phase.name === "discard"
          ? [...state.phase.pending.keys()][0]!
          : state.players[state.currentPlayerIndex]!.id;

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

describe("HeuristicBot", () => {
  it("never proposes an illegal action across a full 2-player game", () => {
    const state = playFullGame(
      { a: new HeuristicBot(), b: new HeuristicBot() },
      "heuristic-smoke-1",
    );
    expect(state.phase.name).toBe("ended");
  }, 30_000);

  it("beats RuleBasedBot more often than not over a handful of seeded games", () => {
    let heuristicWins = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const state = playFullGame({ a: new HeuristicBot(), b: new RuleBasedBot() }, seed);
      expect(state.phase.name).toBe("ended");
      if (state.phase.name === "ended" && state.phase.winner === "a") heuristicWins += 1;
    }
    expect(heuristicWins).toBeGreaterThanOrEqual(seeds.length / 2);
  }, 60_000);
});
