import type { Action, RuleModule } from "@hexhaven/engine";
import { resolveModules } from "../game/moduleResolver.js";
import type { GameRepository } from "../game/gameRepository.js";
import type { GameParticipantRecord, GameRecord, GameStatus, Page } from "../domain/types.js";
import { aggregateGameStats, type GameStats } from "./aggregateGameStats.js";

export class HistoryError extends Error {
  constructor(readonly code: "GAME_NOT_FOUND" | "NOT_A_PARTICIPANT") {
    super(code);
    this.name = "HistoryError";
  }
}

export interface GameDetail {
  readonly game: GameRecord;
  readonly participants: readonly GameParticipantRecord[];
  readonly stats: GameStats;
  /** The full action log, seed, and module list — enough for the client to replay the game itself. */
  readonly actions: readonly Action[];
}

export class HistoryService {
  constructor(private readonly games: GameRepository) {}

  listForUser(
    userId: string,
    options: { status?: GameStatus; cursor?: string; limit: number },
  ): Promise<Page<GameRecord>> {
    return this.games.listForUser(userId, options);
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

    return { game, participants, stats, actions };
  }
}
