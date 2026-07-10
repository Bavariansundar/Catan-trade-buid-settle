/// <reference lib="webworker" />
import {
  applyAction,
  createGame,
  isRuleError,
  viewFor,
  BASE_MODULE,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RuleModule,
} from "@hexhaven/engine";
import {
  canBuyDevCard,
  HeuristicBot,
  legalCityVertices,
  legalMaritimeTrades,
  legalRoadEdges,
  legalSettlementVertices,
  MCTSBot,
  playableDevCardTypes,
  resolveActingPlayerId,
  robberMoveCandidates,
  RuleBasedBot,
  type Bot,
} from "@hexhaven/bots";
import type {
  BotDifficulty,
  EngineWorkerRequest,
  EngineWorkerResponse,
  LegalActionsSummary,
} from "./protocol.js";

const MODULES: readonly RuleModule[] = [BASE_MODULE];

let state: GameState | null = null;
let humanPlayerId: PlayerId | null = null;
let botBySeat: Map<PlayerId, Bot> = new Map();

function botForDifficulty(difficulty: BotDifficulty): Bot {
  if (difficulty === "EASY") return new RuleBasedBot();
  if (difficulty === "MEDIUM") return new HeuristicBot();
  return new MCTSBot({ timeBudgetMs: 1500 });
}

function legalActionsFor(s: GameState, playerId: PlayerId): LegalActionsSummary {
  return {
    settlementVertexIds: legalSettlementVertices(s, playerId).map((v) => v.id),
    cityVertexIds: legalCityVertices(s, playerId).map((v) => v.id),
    roadEdgeIds: legalRoadEdges(s, playerId).map((e) => e.id),
    robberCandidates: robberMoveCandidates(s, playerId),
    maritimeTrades: legalMaritimeTrades(s, playerId),
    canBuyDevCard: canBuyDevCard(s, playerId),
    playableDevCardTypes: playableDevCardTypes(s, playerId),
  };
}

function post(message: EngineWorkerResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

/** Auto-plays consecutive bot turns until it's the human's turn or the game ends. */
function advance(events: GameEvent[], actions: Action[]): void {
  if (!state) return;
  while (state.phase.name !== "ended") {
    const actingId = resolveActingPlayerId(state);
    const bot = botBySeat.get(actingId);
    if (!bot) break;
    const action = bot.chooseAction(state, actingId, MODULES);
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) break; // a bot should never propose an illegal action
    state = result.state;
    events.push(...result.events);
    actions.push(action);
  }
  emitUpdate(events, actions);
}

function emitUpdate(events: GameEvent[], newlyAppliedActions: Action[]): void {
  if (!state || !humanPlayerId) return;
  post({
    type: "update",
    view: viewFor(MODULES, state, humanPlayerId),
    events,
    legalActions: legalActionsFor(state, humanPlayerId),
    gameOver: state.phase.name === "ended",
    newlyAppliedActions,
  });
}

self.onmessage = (e: MessageEvent<EngineWorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    humanPlayerId = msg.humanPlayerId;
    botBySeat = new Map(
      Object.entries(msg.botDifficulties).map(([id, d]) => [id, botForDifficulty(d)]),
    );
    state = createGame(MODULES, {
      playerIds: msg.playerIds,
      seed: msg.seed,
      targetVictoryPoints: msg.targetVictoryPoints,
    });
    for (const action of msg.resumeActions ?? []) {
      const result = applyAction(MODULES, state, action);
      if (isRuleError(result)) {
        throw new Error(`Resume replay failed: ${result.code} — ${result.message}`);
      }
      state = result.state;
    }
    advance([], []);
    return;
  }

  if (msg.type === "action") {
    if (!state) return;
    const result = applyAction(MODULES, state, msg.action);
    if (isRuleError(result)) {
      post({ type: "actionRejected", code: result.code, message: result.message });
      return;
    }
    state = result.state;
    advance([...result.events], [msg.action]);
  }
};
