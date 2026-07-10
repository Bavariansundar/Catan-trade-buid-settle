import {
  RuleBasedBot,
  legalRoadEdges,
  legalSettlementVertices,
  resolveActingPlayerId,
  robberMoveCandidates,
  sensibleDiscard,
} from "@hexhaven/bots";
import {
  applyAction,
  createGame,
  isRuleError,
  BASE_MODULE,
  type Action,
  type GameState,
  type PlayerId,
} from "@hexhaven/engine";
import { aggregateGameStats } from "./aggregateGameStats.js";

const MODULES = [BASE_MODULE];
const PLAYER_IDS = ["a", "b"];

function playThroughSetup(seed: string): { state: GameState; actions: Action[] } {
  let state = createGame(MODULES, { playerIds: PLAYER_IDS, seed, targetVictoryPoints: 10 });
  const actions: Action[] = [];
  while (state.phase.name === "setup") {
    const playerId = resolveActingPlayerId(state);
    const action: Action = state.phase.awaitingRoad
      ? { type: "PLACE_ROAD", playerId, edge: legalRoadEdges(state, playerId)[0]! }
      : {
          type: "PLACE_SETTLEMENT",
          playerId,
          vertex: legalSettlementVertices(state, playerId)[0]!,
        };
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) throw new Error(`Unexpected setup rejection: ${result.code}`);
    state = result.state;
    actions.push(action);
  }
  return { state, actions };
}

/** Rolls, resolves any discard/robber fallout, and stops once the roller reaches the main phase (turn NOT ended). */
function rollAndResolveProduction(state: GameState, actions: Action[]): GameState {
  const playerId = resolveActingPlayerId(state);
  let current = state;

  const roll: Action = { type: "ROLL_DICE", playerId };
  let result = applyAction(MODULES, current, roll);
  if (isRuleError(result)) throw new Error(`Unexpected roll rejection: ${result.code}`);
  current = result.state;
  actions.push(roll);

  while (current.phase.name === "discard") {
    const [owingId, owed] = [...current.phase.pending.entries()][0]!;
    const hand = current.players.find((p) => p.id === owingId)!.hand;
    const discard: Action = {
      type: "DISCARD",
      playerId: owingId,
      resources: sensibleDiscard(hand, owed),
    };
    result = applyAction(MODULES, current, discard);
    if (isRuleError(result)) throw new Error(`Unexpected discard rejection: ${result.code}`);
    current = result.state;
    actions.push(discard);
  }

  if (current.phase.name === "robber") {
    const candidate = robberMoveCandidates(current, playerId)[0]!;
    const moveRobber: Action = {
      type: "MOVE_ROBBER",
      playerId,
      hex: candidate.hex,
      stealFromPlayerId: candidate.stealFromPlayerId,
    };
    result = applyAction(MODULES, current, moveRobber);
    if (isRuleError(result)) throw new Error(`Unexpected robber-move rejection: ${result.code}`);
    current = result.state;
    actions.push(moveRobber);
  }

  return current;
}

function endTurn(state: GameState, actions: Action[]): GameState {
  const playerId = resolveActingPlayerId(state);
  const action: Action = { type: "END_TURN", playerId };
  const result = applyAction(MODULES, state, action);
  if (isRuleError(result)) throw new Error(`Unexpected end-turn rejection: ${result.code}`);
  actions.push(action);
  return result.state;
}

describe("aggregateGameStats", () => {
  it("counts an exact maritime trade's resource deltas", () => {
    const { state: afterSetup, actions } = playThroughSetup("agg-stats-precise");

    // Cycle turns (deterministic given the fixed seed's RNG sequence) until
    // the current roller has banked 4+ wood on their own turn, then
    // hand-craft one 4:1 maritime trade — whatever their hand looked like
    // before, it must now be exactly 4 less wood and 1 more ore, and
    // exactly one trade recorded.
    let state = afterSetup;
    let trader: PlayerId | null = null;
    for (let i = 0; i < 30 && !trader; i++) {
      state = rollAndResolveProduction(state, actions);
      const roller = resolveActingPlayerId(state);
      if (
        state.phase.name === "main" &&
        state.players.find((p) => p.id === roller)!.hand.wood >= 4
      ) {
        trader = roller;
      } else {
        state = endTurn(state, actions);
      }
    }
    if (!trader)
      throw new Error("No roller accumulated 4+ wood within 30 turns — seed needs adjusting");

    const before = state.players.find((p) => p.id === trader)!.hand;
    const tradeAction: Action = {
      type: "MARITIME_TRADE",
      playerId: trader,
      give: "wood",
      get: "ore",
    };
    const result = applyAction(MODULES, state, tradeAction);
    if (isRuleError(result)) throw new Error(`Unexpected trade rejection: ${result.code}`);
    actions.push(tradeAction);
    const after = result.state.players.find((p) => p.id === trader)!.hand;

    // The trade itself moved exactly 4 wood out and 1 ore in for the trader.
    expect(before.wood - after.wood).toBe(4);
    expect(after.ore - before.ore).toBe(1);

    const stats = aggregateGameStats(MODULES, PLAYER_IDS, "agg-stats-precise", 10, actions);
    // resourcesSpentPerPlayer/resourcesGainedPerPlayer tally the *whole* game
    // (production included), so they can only be lower-bounded by the trade
    // itself — but the trade's own contribution must be present in both.
    expect(stats.resourcesSpentPerPlayer[trader]?.wood).toBeGreaterThanOrEqual(4);
    expect(stats.resourcesGainedPerPlayer[trader]?.ore).toBeGreaterThanOrEqual(1);
    expect(stats.tradesPerPlayer[trader]).toBe(1);
    expect(stats.tradesPerPlayer[PLAYER_IDS.find((id) => id !== trader)!]).toBe(0);
  });

  it("aggregates a full bot-vs-bot game to a decided winner with internally-consistent totals", () => {
    const { state: afterSetup, actions } = playThroughSetup("agg-stats-fullgame");
    let state = afterSetup;
    const bot = new RuleBasedBot();

    for (let i = 0; i < 3000 && state.phase.name !== "ended"; i++) {
      const playerId = resolveActingPlayerId(state);
      const action = bot.chooseAction(state, playerId, MODULES);
      const result = applyAction(MODULES, state, action);
      if (isRuleError(result)) throw new Error(`Unexpected rejection: ${result.code}`);
      state = result.state;
      actions.push(action);
    }
    expect(state.phase.name).toBe("ended");

    const stats = aggregateGameStats(MODULES, PLAYER_IDS, "agg-stats-fullgame", 10, actions);

    expect(stats.winnerId).toBe(state.phase.name === "ended" ? state.phase.winner : null);
    expect(stats.vpProgression.length).toBeGreaterThan(0);
    expect(stats.vpProgression.at(-1)!.vpByPlayer[stats.winnerId!]).toBeGreaterThanOrEqual(10);

    const totalDiceRolls = Object.values(stats.diceFrequency).reduce((a, b) => a + b, 0);
    expect(totalDiceRolls).toBeGreaterThan(0);
    for (const sum of Object.keys(stats.diceFrequency).map(Number)) {
      expect(sum).toBeGreaterThanOrEqual(2);
      expect(sum).toBeLessThanOrEqual(12);
    }

    for (const id of PLAYER_IDS) {
      expect(stats.settlementsBuiltPerPlayer[id]).toBeGreaterThanOrEqual(0);
      expect(stats.citiesBuiltPerPlayer[id]).toBeGreaterThanOrEqual(0);
      expect(stats.citiesBuiltPerPlayer[id]!).toBeLessThanOrEqual(4);
    }
  });
});
