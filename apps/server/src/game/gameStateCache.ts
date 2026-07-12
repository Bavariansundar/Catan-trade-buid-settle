import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import type { GameEvent, GameState } from "@baychearsbar/engine";
import { deserializeGameState, serializeGameState } from "./serialization.js";

export interface GameStateUpdateMessage {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** The `GameAction` log's seq for the action that produced this update — lets clients track a reconnection watermark. */
  readonly latestSeq: number;
}

/**
 * Redis-backed state cache + pub/sub (see docs/architecture/server.md §4a,
 * §4b) — the Postgres `GameAction` log remains the source of truth; this is
 * purely a read-path optimization plus the cross-instance broadcast
 * mechanism for a horizontally-scaled deployment.
 */
export interface GameStateCache {
  get(gameId: string): Promise<GameState | null>;
  set(gameId: string, state: GameState): Promise<void>;
  delete(gameId: string): Promise<void>;
  publish(gameId: string, message: GameStateUpdateMessage): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(gameId: string, handler: (message: GameStateUpdateMessage) => void): () => void;
}

function cacheKey(gameId: string): string {
  return `game:${gameId}:state`;
}

function channelName(gameId: string): string {
  return `game:${gameId}:events`;
}

export class RedisGameStateCache implements GameStateCache {
  private readonly subscriber: Redis;

  constructor(private readonly client: Redis) {
    this.subscriber = client.duplicate();
  }

  async get(gameId: string): Promise<GameState | null> {
    const raw = await this.client.get(cacheKey(gameId));
    return raw ? deserializeGameState(JSON.parse(raw)) : null;
  }

  async set(gameId: string, state: GameState): Promise<void> {
    await this.client.set(cacheKey(gameId), JSON.stringify(serializeGameState(state)));
  }

  async delete(gameId: string): Promise<void> {
    await this.client.del(cacheKey(gameId));
  }

  async publish(gameId: string, message: GameStateUpdateMessage): Promise<void> {
    await this.client.publish(
      channelName(gameId),
      JSON.stringify({
        state: serializeGameState(message.state),
        events: message.events,
        latestSeq: message.latestSeq,
      }),
    );
  }

  subscribe(gameId: string, handler: (message: GameStateUpdateMessage) => void): () => void {
    const channel = channelName(gameId);
    const listener = (chan: string, raw: string): void => {
      if (chan !== channel) return;
      const parsed = JSON.parse(raw) as { state: unknown; events: GameEvent[]; latestSeq: number };
      handler({
        state: deserializeGameState(parsed.state),
        events: parsed.events,
        latestSeq: parsed.latestSeq,
      });
    };
    void this.subscriber.subscribe(channel);
    this.subscriber.on("message", listener);
    return () => {
      this.subscriber.off("message", listener);
      void this.subscriber.unsubscribe(channel);
    };
  }
}

/** See docs/architecture/server.md §0 — an in-process EventEmitter stands in for Redis pub/sub. */
export class InMemoryGameStateCache implements GameStateCache {
  private readonly states = new Map<string, GameState>();
  private readonly emitter = new EventEmitter();

  get(gameId: string): Promise<GameState | null> {
    return Promise.resolve(this.states.get(gameId) ?? null);
  }

  set(gameId: string, state: GameState): Promise<void> {
    this.states.set(gameId, state);
    return Promise.resolve();
  }

  delete(gameId: string): Promise<void> {
    this.states.delete(gameId);
    return Promise.resolve();
  }

  publish(gameId: string, message: GameStateUpdateMessage): Promise<void> {
    this.emitter.emit(gameId, message);
    return Promise.resolve();
  }

  subscribe(gameId: string, handler: (message: GameStateUpdateMessage) => void): () => void {
    this.emitter.on(gameId, handler);
    return () => this.emitter.off(gameId, handler);
  }
}
