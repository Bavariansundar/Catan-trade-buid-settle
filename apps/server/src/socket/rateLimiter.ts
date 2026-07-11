/**
 * A plain per-key fixed-window counter, deliberately *not* wired as a
 * blanket `socket.use()` packet interceptor across every event: `game:action`
 * has no artificial pacing (a bot-driven client can legitimately submit
 * hundreds of actions/sec — see the integration tests), so a uniform
 * per-socket cap either breaks that or has to be so generous it stops
 * meaningfully bounding anything. Chat has no such excuse — a human never
 * needs to send messages faster than this — so it's applied narrowly to
 * `lobby:chat` only (see lobbySocket.ts). See docs/technical-debt.md for the
 * broader action-flood DoS gap this deliberately leaves open.
 */
export interface EventRateLimiterOptions {
  readonly windowMs: number;
  readonly maxEventsPerWindow: number;
}

export function createEventRateLimiter(options: EventRateLimiterOptions): (key: string) => boolean {
  const windows = new Map<string, { windowStart: number; count: number }>();

  return function isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || now - entry.windowStart >= options.windowMs) {
      windows.set(key, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= options.maxEventsPerWindow;
  };
}
