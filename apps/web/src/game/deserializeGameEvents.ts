import type { RedactedGameEvent } from "@hexhaven/engine";

/**
 * Mirror of `deserializeGameView.ts` for the event log that travels
 * alongside every view — see apps/server's `serializeGameEvents`.
 * `RESOURCES_PRODUCED.production` and `MONOPOLY_PLAYED.seized` are the only
 * two `GameEvent` fields that are `Map`s; every other field survives plain
 * JSON transport untouched.
 */
export function deserializeGameEvents(json: unknown): RedactedGameEvent[] {
  const events = json as Record<string, unknown>[];
  return events.map((event) => {
    if (event["type"] === "RESOURCES_PRODUCED") {
      return { ...event, production: new Map(event["production"] as [string, unknown][]) };
    }
    if (event["type"] === "MONOPOLY_PLAYED") {
      return { ...event, seized: new Map(event["seized"] as [string, number][]) };
    }
    return event;
  }) as RedactedGameEvent[];
}
