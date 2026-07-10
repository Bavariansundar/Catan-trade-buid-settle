import type { GameView } from "@hexhaven/engine";

export interface PlayerPanelProps {
  readonly view: GameView;
  readonly playerColors: Record<string, string>;
  readonly nameFor: (playerId: string) => string;
}

export function PlayerPanel({ view, playerColors, nameFor }: PlayerPanelProps) {
  const currentPlayerId = view.players[view.currentPlayerIndex]?.id;
  return (
    <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <h3 style={{ fontSize: "1rem" }}>Players</h3>
      {view.players.map((p) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.5rem",
            borderRadius: "var(--hh-radius-sm)",
            background: p.id === currentPlayerId ? "var(--hh-bg-elevated)" : "transparent",
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: playerColors[p.id],
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, fontWeight: p.id === currentPlayerId ? 600 : 400 }}>
            {nameFor(p.id)}
            {p.id === view.longestRoadPlayerId && " 🛣️"}
            {p.id === view.largestArmyPlayerId && " ⚔️"}
          </span>
          <span style={{ fontSize: "0.85rem", color: "var(--hh-text-dim)" }}>
            {p.handCount} cards · {view.publicVictoryPoints.get(p.id) ?? 0} VP
          </span>
        </div>
      ))}
    </div>
  );
}
