import { randomUUID } from "node:crypto";
import { resolveActingPlayerId, type Bot } from "@hexhaven/bots";
import {
  applyAction,
  createGame,
  isRuleError,
  type Action,
  type ApplyResult,
  type ApplySuccess,
  type GameEvent,
  type GameState,
  type RuleError,
  type RuleModule,
} from "@hexhaven/engine";
import type { AppConfig } from "../config.js";
import type { BotDifficulty, GameConfigSnapshot, LobbyRecord } from "../domain/types.js";
import type { MatchRecorder } from "../stats/matchRecorder.js";
import type { GameRepository } from "./gameRepository.js";
import type { GameStateCache } from "./gameStateCache.js";
import { resolveModules } from "./moduleResolver.js";
import { autoPilotBot, autoResolveTimeout, createBotForDifficulty } from "./turnAutomation.js";

function botSeatPlayerId(seatIndex: number): string {
  return `bot-seat-${String(seatIndex)}`;
}

interface LoadedGame {
  readonly state: GameState;
  readonly modules: readonly RuleModule[];
  readonly config: GameConfigSnapshot;
}

/**
 * Server-authoritative engine integration — see docs/architecture/server.md
 * §4/§5. Every state mutation goes through {@link submitAction} (from a
 * real player), the turn timer, or disconnect takeover, all of which fold
 * into the same locked, cached, persisted, auto-play pipeline so a bot's
 * turn is indistinguishable from a human's as far as the log/cache/broadcast
 * are concerned.
 */
export class GameRuntimeService {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly turnTimers = new Map<string, NodeJS.Timeout>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly takenOverPlayers = new Map<string, Set<string>>();

  constructor(
    private readonly games: GameRepository,
    private readonly cache: GameStateCache,
    private readonly config: AppConfig,
    /** Optional: not every caller (e.g. existing tests, single-player-only setups) needs match history/stats/achievements recorded. */
    private readonly matchRecorder?: MatchRecorder,
  ) {}

  async startGame(lobby: LobbyRecord): Promise<{ gameId: string; state: GameState }> {
    const modules = resolveModules(lobby.enabledModuleIds);
    const seatPlayerIds = lobby.seats.map((s) => s.userId ?? botSeatPlayerId(s.seatIndex));
    const botSeats: Record<string, BotDifficulty> = {};
    for (const seat of lobby.seats) {
      if (!seat.userId && seat.botDifficulty)
        botSeats[botSeatPlayerId(seat.seatIndex)] = seat.botDifficulty;
    }
    const seed = randomUUID();
    const config: GameConfigSnapshot = {
      moduleIds: [...lobby.enabledModuleIds],
      targetVictoryPoints: lobby.targetVictoryPoints,
      seatPlayerIds,
      turnTimerSeconds: lobby.turnTimerSeconds,
      botSeats,
    };
    const game = await this.games.create({ lobbyId: lobby.id, seed, configJson: config });
    const humanParticipants = lobby.seats
      .filter((s): s is typeof s & { userId: string } => s.userId !== null)
      .map((s) => ({ userId: s.userId, seatIndex: s.seatIndex }));
    await this.games.addParticipants(game.id, humanParticipants);
    const initialState = createGame(modules, {
      playerIds: seatPlayerIds,
      seed,
      targetVictoryPoints: lobby.targetVictoryPoints,
    });
    await this.cache.set(game.id, initialState);
    const finalState = await this.advance(game.id, { state: initialState, modules, config });
    return { gameId: game.id, state: finalState };
  }

  async submitAction(gameId: string, playerId: string, action: Action): Promise<ApplyResult> {
    return this.withLock(gameId, async () => {
      const loaded = await this.mustLoad(gameId);
      const applied = await this.applyAndPersist(
        gameId,
        loaded.modules,
        loaded.state,
        playerId,
        action,
      );
      if ("error" in applied) return applied.error;
      await this.advance(gameId, { ...loaded, state: applied.success.state });
      return applied.success;
    });
  }

  /** Called by the socket layer when a player's last socket for this game disconnects. */
  onDisconnect(gameId: string, playerId: string): void {
    this.clearDisconnectTimer(gameId, playerId);
    const timer = setTimeout(() => {
      void this.applyTakeover(gameId, playerId);
    }, this.config.disconnectGraceSeconds * 1000);
    timer.unref(); // never keep the process alive on this timer's account
    this.disconnectTimers.set(`${gameId}:${playerId}`, timer);
  }

  /** Called by the socket layer when a player reconnects (any new socket authenticated as them, for this game). */
  onReconnect(gameId: string, playerId: string): void {
    this.clearDisconnectTimer(gameId, playerId);
    this.takenOverPlayers.get(gameId)?.delete(playerId);
  }

  isTakenOver(gameId: string, playerId: string): boolean {
    return this.takenOverPlayers.get(gameId)?.has(playerId) ?? false;
  }

  async loadGame(gameId: string): Promise<LoadedGame> {
    return this.mustLoad(gameId);
  }

  async getLatestSeq(gameId: string): Promise<number> {
    const actions = await this.games.listActions(gameId);
    return actions.at(-1)?.seq ?? -1;
  }

  /**
   * Reconnection support: replays the action log from scratch, collecting
   * every event emitted *after* `sinceSeq` — see docs/architecture/server.md
   * §4's "reconnection replays missed events". Returns `null` if the log is
   * too long to replay reasonably (caller falls back to a snapshot-only
   * catch-up) or `sinceSeq` doesn't correspond to a real point in this
   * game's history.
   */
  async replayEventsSince(
    gameId: string,
    sinceSeq: number,
  ): Promise<{ state: GameState; events: GameEvent[] } | null> {
    const REPLAY_CAP = 200;
    const game = await this.games.findById(gameId);
    if (!game) return null;
    const modules = resolveModules(game.configJson.moduleIds);
    const allActions = await this.games.listActions(gameId);
    const latestSeq = allActions.at(-1)?.seq ?? -1;
    if (sinceSeq < -1 || sinceSeq > latestSeq) return null;
    if (latestSeq - sinceSeq > REPLAY_CAP) return null;

    let state = createGame(modules, {
      playerIds: game.configJson.seatPlayerIds,
      seed: game.seed,
      targetVictoryPoints: game.configJson.targetVictoryPoints,
    });
    const events: GameEvent[] = [];
    for (const record of allActions) {
      const result = applyAction(modules, state, record.actionJson);
      if (isRuleError(result)) {
        throw new Error(
          `Replay failed for game ${gameId} at seq ${String(record.seq)}: ${result.code} — ${result.message}`,
        );
      }
      state = result.state;
      if (record.seq > sinceSeq) events.push(...result.events);
    }
    return { state, events };
  }

  private async applyTakeover(gameId: string, playerId: string): Promise<void> {
    let set = this.takenOverPlayers.get(gameId);
    if (!set) {
      set = new Set();
      this.takenOverPlayers.set(gameId, set);
    }
    set.add(playerId);
    await this.withLock(gameId, async () => {
      const loaded = await this.mustLoad(gameId);
      if (loaded.state.phase.name === "ended") return;
      await this.advance(gameId, loaded);
    });
  }

  private async applyAndPersist(
    gameId: string,
    modules: readonly RuleModule[],
    state: GameState,
    playerId: string,
    action: Action,
  ): Promise<{ success: ApplySuccess } | { error: RuleError }> {
    const result = applyAction(modules, state, action);
    if (isRuleError(result)) return { error: result };
    const record = await this.games.appendAction(gameId, playerId, action);
    await this.cache.set(gameId, result.state);
    await this.cache.publish(gameId, {
      state: result.state,
      events: result.events,
      latestSeq: record.seq,
    });
    return { success: result };
  }

  /** Auto-plays consecutive bot/takeover turns, then arms the timer for whoever's turn it becomes (or settles the game). */
  private async advance(gameId: string, loaded: LoadedGame): Promise<GameState> {
    const { modules, config } = loaded;
    let current = loaded.state;
    while (current.phase.name !== "ended") {
      const actingPlayerId = resolveActingPlayerId(current);
      const bot = this.pickAutoBot(gameId, config.botSeats, actingPlayerId);
      if (!bot) break;
      const action = bot.chooseAction(current, actingPlayerId, modules);
      const applied = await this.applyAndPersist(gameId, modules, current, actingPlayerId, action);
      if ("error" in applied) break; // shouldn't happen — a bot should never propose an illegal action.
      current = applied.success.state;
    }

    if (current.phase.name === "ended") {
      const gameRecord = await this.games.markEnded(gameId, current.phase.winner);
      this.clearTurnTimer(gameId);
      if (this.matchRecorder) await this.matchRecorder.recordGameEnded(gameRecord);
    } else {
      this.armTurnTimer(gameId, config.turnTimerSeconds, current);
    }
    return current;
  }

  private pickAutoBot(
    gameId: string,
    botSeats: Readonly<Record<string, BotDifficulty>>,
    playerId: string,
  ): Bot | null {
    const difficulty = botSeats[playerId];
    if (difficulty) return createBotForDifficulty(difficulty);
    if (this.isTakenOver(gameId, playerId)) return autoPilotBot();
    return null;
  }

  private armTurnTimer(gameId: string, turnTimerSeconds: number, state: GameState): void {
    this.clearTurnTimer(gameId);
    const playerId = resolveActingPlayerId(state);
    const timer = setTimeout(() => {
      void this.handleTurnTimeout(gameId, playerId);
    }, turnTimerSeconds * 1000);
    timer.unref(); // never keep the process alive on this timer's account
    this.turnTimers.set(gameId, timer);
  }

  private async handleTurnTimeout(gameId: string, playerId: string): Promise<void> {
    await this.withLock(gameId, async () => {
      const loaded = await this.mustLoad(gameId);
      if (loaded.state.phase.name === "ended") return;
      if (resolveActingPlayerId(loaded.state) !== playerId) return; // stale timer; state already moved on
      const action = autoResolveTimeout(loaded.state, playerId, loaded.modules);
      const applied = await this.applyAndPersist(
        gameId,
        loaded.modules,
        loaded.state,
        playerId,
        action,
      );
      if ("error" in applied) return;
      await this.advance(gameId, { ...loaded, state: applied.success.state });
    });
  }

  private clearTurnTimer(gameId: string): void {
    const timer = this.turnTimers.get(gameId);
    if (timer) clearTimeout(timer);
    this.turnTimers.delete(gameId);
  }

  private clearDisconnectTimer(gameId: string, playerId: string): void {
    const key = `${gameId}:${playerId}`;
    const timer = this.disconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(key);
  }

  private async mustLoad(gameId: string): Promise<LoadedGame> {
    const game = await this.games.findById(gameId);
    if (!game) throw new Error(`No such game ${gameId}`);
    const modules = resolveModules(game.configJson.moduleIds);

    let state = await this.cache.get(gameId);
    if (!state) {
      state = createGame(modules, {
        playerIds: game.configJson.seatPlayerIds,
        seed: game.seed,
        targetVictoryPoints: game.configJson.targetVictoryPoints,
      });
      for (const record of await this.games.listActions(gameId)) {
        const result = applyAction(modules, state, record.actionJson);
        if (isRuleError(result)) {
          throw new Error(
            `Replay failed for game ${gameId} at seq ${String(record.seq)}: ${result.code} — ${result.message}`,
          );
        }
        state = result.state;
      }
      await this.cache.set(gameId, state);
    }
    return { state, modules, config: game.configJson };
  }

  private withLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(gameId) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    this.locks.set(
      gameId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }
}
