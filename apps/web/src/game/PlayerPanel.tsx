import type { GameView } from "@baychearsbar/engine";

export interface PlayerPanelProps {
  readonly view: GameView;
  readonly playerColors: Record<string, string>;
  readonly nameFor: (playerId: string) => string;
}

/** Horizontal strip of player chips — sits at the top of the table, above the board, so it never competes with board space. */
export function PlayerPanel({ view, playerColors, nameFor }: PlayerPanelProps) {
  const currentPlayerId = view.players[view.currentPlayerIndex]?.id;
  return (
    <div
      className="hh-card"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        padding: "0.55rem 0.7rem",
        alignItems: "center",
      }}
    >
      {view.players.map((p) => {
        const isCurrent = p.id === currentPlayerId;
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.65rem",
              borderRadius: "var(--hh-radius-sm)",
              background: isCurrent ? "var(--hh-bg-elevated)" : "transparent",
              border: isCurrent ? "1px solid var(--hh-accent-dim)" : "1px solid transparent",
              transition: "background 0.2s var(--hh-ease), border-color 0.2s var(--hh-ease)",
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: playerColors[p.id],
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "rgba(0,0,0,0.55)",
                border: "2px solid rgba(255,255,255,0.25)",
                boxShadow: isCurrent ? "0 0 0 3px rgba(217,171,63,0.25)" : "none",
              }}
            >
              {nameFor(p.id).slice(0, 1).toUpperCase()}
            </span>
            <span style={{ fontWeight: isCurrent ? 700 : 500, whiteSpace: "nowrap" }}>
              {nameFor(p.id)}
              {p.id === view.longestRoadPlayerId && " 🛣️"}
              {p.id === view.largestArmyPlayerId && " ⚔️"}
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                color: "var(--hh-text-dim)",
                whiteSpace: "nowrap",
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <span title="Resource cards">🃏 {p.handCount}</span>
              <span title="Development cards">🎴 {p.devCardCount}</span>
              <strong style={{ color: "var(--hh-accent-hi)" }}>
                {view.publicVictoryPoints.get(p.id) ?? 0} VP
              </strong>
            </span>
          </div>
        );
      })}
    </div>
  );
}
