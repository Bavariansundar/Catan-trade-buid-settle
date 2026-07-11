import {
  isRuleError,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type RuleModule,
} from "@hexhaven/engine";
import type { GameRuntimeService } from "../game/gameRuntime.js";
import type { GameStateCache } from "../game/gameStateCache.js";
import { serializeGameView } from "../game/serialization.js";
import { gameActionSchema, gameWatchSchema } from "./schemas.js";
import type { AppServer, AppSocket } from "./types.js";

function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

/** No real player ever has this id, so `viewFor` redacts every hand — exactly the "neutral" spectator view. */
const SPECTATOR_VIEWER_ID = "__spectator__";

/**
 * One Redis (or in-memory) pub/sub subscription per active game, shared by
 * every watching socket — not one per socket — re-emitting a per-socket
 * redacted view on every published update. See docs/architecture/server.md
 * §4.
 */
class GameBroadcaster {
  private readonly unsubscribeByGame = new Map<string, () => void>();

  constructor(
    private readonly io: AppServer,
    private readonly cache: GameStateCache,
    private readonly gameRuntime: GameRuntimeService,
  ) {}

  ensureSubscribed(gameId: string): void {
    if (this.unsubscribeByGame.has(gameId)) return;
    const unsubscribe = this.cache.subscribe(gameId, (message) => {
      void this.fanOut(gameId, message.state, message.events, message.latestSeq);
    });
    this.unsubscribeByGame.set(gameId, unsubscribe);
  }

  private async fanOut(
    gameId: string,
    state: GameState,
    events: readonly GameEvent[],
    latestSeq: number,
  ): Promise<void> {
    if (state.phase.name === "ended") {
      this.unsubscribeByGame.get(gameId)?.();
      this.unsubscribeByGame.delete(gameId);
    }
    const { modules, config } = await this.gameRuntime.loadGame(gameId);
    const sockets = await this.io.in(gameRoom(gameId)).fetchSockets();
    for (const socket of sockets) {
      const isPlayer = config.seatPlayerIds.includes(socket.data.userId);
      const viewerId = isPlayer ? socket.data.userId : SPECTATOR_VIEWER_ID;
      socket.emit("game:update", {
        view: serializeGameView(viewFor(modules as RuleModule[], state, viewerId)),
        events,
        latestSeq,
      });
    }
  }
}

let broadcaster: GameBroadcaster | undefined;

export function registerGameSocketHandlers(
  io: AppServer,
  socket: AppSocket,
  gameRuntime: GameRuntimeService,
  cache: GameStateCache,
): void {
  broadcaster ??= new GameBroadcaster(io, cache, gameRuntime);
  const userId = socket.data.userId;

  socket.on("game:watch", async (rawPayload: unknown) => {
    const parsed = gameWatchSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("game:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const payload = parsed.data;
    const loaded = await gameRuntime.loadGame(payload.gameId).catch(() => null);
    if (!loaded) {
      socket.emit("game:error", { code: "NOT_FOUND" });
      return;
    }
    await socket.join(gameRoom(payload.gameId));
    broadcaster!.ensureSubscribed(payload.gameId);

    const isPlayer = loaded.config.seatPlayerIds.includes(userId);
    if (isPlayer) {
      socket.data.watchedPlayerGames.add(payload.gameId);
      gameRuntime.onReconnect(payload.gameId, userId);
    }
    const viewerId = isPlayer ? userId : SPECTATOR_VIEWER_ID;

    if (typeof payload.lastSeenSeq === "number") {
      const replay = await gameRuntime.replayEventsSince(payload.gameId, payload.lastSeenSeq);
      if (replay) {
        socket.emit("game:update", {
          view: serializeGameView(viewFor(loaded.modules as RuleModule[], replay.state, viewerId)),
          events: replay.events,
          latestSeq: await gameRuntime.getLatestSeq(payload.gameId),
        });
        return;
      }
    }
    socket.emit("game:update", {
      view: serializeGameView(viewFor(loaded.modules as RuleModule[], loaded.state, viewerId)),
      events: [],
      latestSeq: await gameRuntime.getLatestSeq(payload.gameId),
    });
  });

  socket.on(
    "game:action",
    async (
      rawPayload: unknown,
      ack?: (response: { ok: true } | { ok: false; code: string; message: string }) => void,
    ) => {
      const parsed = gameActionSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const rejection = { code: "INVALID_PAYLOAD", message: "Malformed action payload" };
        socket.emit("game:actionRejected", rejection);
        ack?.({ ok: false, ...rejection });
        return;
      }
      const payload = parsed.data;
      if (!socket.data.watchedPlayerGames.has(payload.gameId)) {
        const rejection = { code: "NOT_A_PLAYER", message: "Spectators cannot act" };
        socket.emit("game:actionRejected", rejection);
        ack?.({ ok: false, ...rejection });
        return;
      }
      // Never trust a client-supplied playerId — this socket only ever acts as itself.
      const action = { ...payload.action, playerId: userId } as Action;
      const result = await gameRuntime.submitAction(payload.gameId, userId, action);
      if (isRuleError(result)) {
        socket.emit("game:actionRejected", { code: result.code, message: result.message });
        ack?.({ ok: false, code: result.code, message: result.message });
      } else {
        ack?.({ ok: true });
      }
    },
  );

  socket.on("disconnect", () => {
    for (const gameId of socket.data.watchedPlayerGames) {
      gameRuntime.onDisconnect(gameId, userId);
    }
  });
}
