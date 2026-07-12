import type { GameState, GameView, RedactedGameEvent } from "@baychearsbar/engine";

/**
 * `GameState` uses `ReadonlyMap`/`ReadonlySet` throughout (buildings, roads,
 * trade offers, ships, knights, ...) so it doesn't round-trip through plain
 * `JSON.stringify`/`parse` — this pair converts every such field to/from
 * plain JSON (arrays of entries for Maps, arrays for Sets) so it can be
 * cached in Redis. See docs/architecture/server.md §4a.
 *
 * Deliberately explicit rather than a generic "walk and convert every Map/
 * Set" reflection helper: `GameState`'s exact shape is enumerated here by
 * hand, matching every module through Phase 6. A future engine module that
 * adds a new Map/Set field to `GameState` (or nested inside a `Phase`
 * variant, as `discard`/`barbarianTribute`'s `pending` already is) needs
 * this file updated too — that's an acceptable, explicit coupling given how
 * rarely the engine's top-level state shape actually changes.
 */

type Json = unknown;

function mapToEntries<K, V>(map: ReadonlyMap<K, V>): [K, V][] {
  return [...map.entries()];
}

export function serializeGameState(state: GameState): Json {
  const { phase, ...rest } = state;

  let serializedPhase: Json = phase;
  if (phase.name === "discard" || phase.name === "barbarianTribute") {
    serializedPhase = { ...phase, pending: mapToEntries(phase.pending) };
  }

  return {
    ...rest,
    buildings: mapToEntries(state.buildings),
    roads: mapToEntries(state.roads),
    tradeOffers: mapToEntries(state.tradeOffers),
    ships: mapToEntries(state.ships),
    hiddenHexes: mapToEntries(state.hiddenHexes),
    islandBonusAwarded: mapToEntries(state.islandBonusAwarded),
    knights: mapToEntries(state.knights),
    cityWalls: [...state.cityWalls],
    metropolises: mapToEntries(state.metropolises),
    deferredBarbarianTribute: state.deferredBarbarianTribute
      ? mapToEntries(state.deferredBarbarianTribute)
      : null,
    phase: serializedPhase,
  };
}

export function deserializeGameState(json: Json): GameState {
  const data = json as Record<string, unknown>;
  const phaseData = data["phase"] as Record<string, unknown>;

  let phase = phaseData;
  if (phaseData["name"] === "discard" || phaseData["name"] === "barbarianTribute") {
    phase = { ...phaseData, pending: new Map(phaseData["pending"] as [string, number][]) };
  }

  return {
    ...data,
    buildings: new Map(data["buildings"] as [string, unknown][]),
    roads: new Map(data["roads"] as [string, unknown][]),
    tradeOffers: new Map(data["tradeOffers"] as [string, unknown][]),
    ships: new Map(data["ships"] as [string, unknown][]),
    hiddenHexes: new Map(data["hiddenHexes"] as [string, unknown][]),
    islandBonusAwarded: new Map(data["islandBonusAwarded"] as [string, unknown][]),
    knights: new Map(data["knights"] as [string, unknown][]),
    cityWalls: new Set(data["cityWalls"] as string[]),
    metropolises: new Map(data["metropolises"] as [string, unknown][]),
    deferredBarbarianTribute: data["deferredBarbarianTribute"]
      ? new Map(data["deferredBarbarianTribute"] as [string, number][])
      : null,
    phase,
  } as unknown as GameState;
}

/**
 * `GameView` (the redacted per-player projection sent to socket clients) has
 * its own, smaller set of top-level Map fields — `buildings`, `roads`,
 * `tradeOffers`, `publicVictoryPoints` — which need the same array-of-entries
 * treatment before crossing the wire, or a client-side Socket.IO consumer
 * receives plain `{}` in their place (Socket.IO JSON-encodes emitted
 * payloads, and `Map` has no native JSON representation). See
 * gameSocket.ts's emit sites.
 *
 * `view.phase` is the same `Phase` union as `GameState.phase`, so it carries
 * the same nested `pending` Map when `phase.name` is "discard" or
 * "barbarianTribute" — handled here the same way `serializeGameState` does.
 */
export function serializeGameView(view: GameView): Json {
  let serializedPhase: Json = view.phase;
  if (view.phase.name === "discard" || view.phase.name === "barbarianTribute") {
    serializedPhase = { ...view.phase, pending: mapToEntries(view.phase.pending) };
  }

  return {
    ...view,
    buildings: mapToEntries(view.buildings),
    roads: mapToEntries(view.roads),
    tradeOffers: mapToEntries(view.tradeOffers),
    publicVictoryPoints: mapToEntries(view.publicVictoryPoints),
    phase: serializedPhase,
  };
}

/**
 * Two `GameEvent` variants carry a `ReadonlyMap` field — `RESOURCES_PRODUCED.production`
 * and `MONOPOLY_PLAYED.seized`, both public per-player breakdowns (production
 * is fully derivable from public board state + the roll; a monopoly seizure
 * happens face-up in the physical game too — see `redactEventsFor`'s doc
 * comment for which fields are actually secret). Same array-of-entries
 * treatment as every other Map field crossing the wire, or these two
 * silently arrive as `{}` client-side.
 */
export function serializeGameEvents(events: readonly RedactedGameEvent[]): Json {
  return events.map((event) => {
    if (event.type === "RESOURCES_PRODUCED") {
      return { ...event, production: mapToEntries(event.production) };
    }
    if (event.type === "MONOPOLY_PLAYED") {
      return { ...event, seized: mapToEntries(event.seized) };
    }
    return event;
  });
}
