import {
  applyAction,
  createGame,
  isRuleError,
  redactEventsFor,
  viewFor,
  type Action,
  type PlayerId,
  type RuleModule,
} from "@hexhaven/engine";
import { resolveModules } from "../game/moduleResolver.js";
import { serializeGameEvents, serializeGameView } from "../game/serialization.js";
import type { GameRepository } from "../game/gameRepository.js";
import type { GameParticipantRecord, GameRecord, GameStatus, Page } from "../domain/types.js";
import { aggregateGameStats, type GameStats } from "./aggregateGameStats.js";

export class HistoryError extends Error {
  constructor(readonly code: "GAME_NOT_FOUND" | "NOT_A_PARTICIPANT") {
    super(code);
    this.name = "HistoryError";
  }
}

/** `GameRecord` minus `seed` — the seed is what makes replaying hidden state (opponents' exact hands, which dev card was drawn, ...) possible, so it never leaves the server. See docs/technical-debt.md item #1. */
export type PublicGameRecord = Omit<GameRecord, "seed">;

export interface ReplayStep {
  /** Already redacted for the requesting participant and serialized for JSON transport — same shape `game:update` sends live. */
  readonly view: unknown;
  readonly events: unknown;
}

export interface GameDetail {
  readonly game: PublicGameRecord;
  readonly participants: readonly GameParticipantRecord[];
  readonly stats: GameStats;
  /**
   * One entry per action, plus the initial state — each already redacted
   * for the requesting participant server-side (own hand/dev-cards visible,
   * everyone else's counts-only; DISCARDED/RESOURCE_STOLEN/DEV_CARD_BOUGHT/
   * PROGRESS_CARD_DRAWN's secret fields stripped unless this viewer is
   * entitled — see `redactEventsFor`). The client only ever gets exactly
   * what this one participant was entitled to see at each point in the
   * game; unlike the previous "seed + raw actions" shape, nothing here lets
   * it reconstruct anyone else's hidden state itself.
   */
  readonly replay: readonly ReplayStep[];
}

function stripSeed(game: GameRecord): PublicGameRecord {
  return {
    id: game.id,
    lobbyId: game.lobbyId,
    configJson: game.configJson,
    status: game.status,
    winnerId: game.winnerId,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
  };
}

export class HistoryService {
  constructor(private readonly games: GameRepository) {}

  async listForUser(
    userId: string,
    options: { status?: GameStatus; cursor?: string; limit: number },
  ): Promise<Page<PublicGameRecord>> {
    const page = await this.games.listForUser(userId, options);
    return { ...page, items: page.items.map(stripSeed) };
  }

  async getDetail(userId: string, gameId: string): Promise<GameDetail> {
    const game = await this.games.findById(gameId);
    if (!game) throw new HistoryError("GAME_NOT_FOUND");
    const participants = await this.games.listParticipants(gameId);
    if (!participants.some((p) => p.userId === userId)) throw new HistoryError("NOT_A_PARTICIPANT");

    const actionRecords = await this.games.listActions(gameId);
    const actions = actionRecords.map((a) => a.actionJson);
    const modules: readonly RuleModule[] = resolveModules(game.configJson.moduleIds);
    const stats = aggregateGameStats(
      modules,
      game.configJson.seatPlayerIds,
      game.seed,
      game.configJson.targetVictoryPoints,
      actions,
    );

    const replay = buildRedactedReplay(modules, game, actions, userId);

    return { game: stripSeed(game), participants, stats, replay };
  }
}

/** Replays the game once, server-side (trusted — has the seed), redacting each step's view and events for `viewerId` before they ever leave this function. */
function buildRedactedReplay(
  modules: readonly RuleModule[],
  game: GameRecord,
  actions: readonly Action[],
  viewerId: PlayerId,
): ReplayStep[] {
  let state = createGame(modules, {
    playerIds: game.configJson.seatPlayerIds,
    seed: game.seed,
    targetVictoryPoints: game.configJson.targetVictoryPoints,
  });
  const steps: ReplayStep[] = [
    { view: serializeGameView(viewFor(modules, state, viewerId)), events: [] },
  ];
  for (const action of actions) {
    const result = applyAction(modules, state, action);
    if (isRuleError(result)) break;
    state = result.state;
    steps.push({
      view: serializeGameView(viewFor(modules, state, viewerId)),
      events: serializeGameEvents(redactEventsFor(result.events, viewerId)),
    });
  }
  return steps;
}
