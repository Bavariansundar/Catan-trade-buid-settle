import type { GameView } from "@baychearsbar/engine";

/**
 * Reconstructs the Map fields Socket.IO's JSON encoding flattens on the wire
 * — `buildings`, `roads`, `tradeOffers`, `publicVictoryPoints`, and (nested
 * inside `phase`, when `phase.name` is "discard" or "barbarianTribute") the
 * `pending` map — matching apps/server's `serializeGameView` (see
 * docs/architecture/server.md §4b). Without this, `view.buildings.get(...)`
 * and friends throw at runtime, since the received value is a plain array
 * of entries, not a `Map`.
 */
export function deserializeGameView(json: unknown): GameView {
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
    publicVictoryPoints: new Map(data["publicVictoryPoints"] as [string, number][]),
    phase,
  } as unknown as GameView;
}
