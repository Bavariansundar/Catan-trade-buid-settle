import type { GameState, PlayerId } from "@hexhaven/engine";

/** Who is expected to act next, across every phase this bot package supports (see types.ts's scope note). */
export function resolveActingPlayerId(state: GameState): PlayerId {
  if (state.phase.name === "setup") return state.phase.order[state.phase.step]!;
  if (state.phase.name === "discard") return [...state.phase.pending.keys()][0]!;
  if (state.phase.name === "specialBuild")
    return state.phase.queue[0] ?? state.players[state.currentPlayerIndex]!.id;
  return state.players[state.currentPlayerIndex]!.id;
}
