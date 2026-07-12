import { useState } from "react";
import type { GameView } from "@baychearsbar/engine";

export interface PlayerPanelProps {
  readonly view: GameView;
  readonly playerColors: Record<string, string>;
  readonly nameFor: (playerId: string) => string;
}

/**
 * Translucent chip strip overlaid at the top of the board. On narrow
 * screens the chips collapse to disc + hand count + VP (the always-visible
 * stats); tapping a chip expands its name and dev-card count in place —
 * see docs/architecture/mobile-ux.md §3–4. The show/hide itself is CSS
 * (`.hh-chip-name` / `.hh-chip-extra` under the narrow media query), so
 * wide screens always show everything and the tap state is inert there.
 */
export function PlayerPanel({ view, playerColors, nameFor }: PlayerPanelProps) {
  const currentPlayerId = view.players[view.currentPlayerIndex]?.id;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="hh-hud-panel hh-hud-chips">
      {view.players.map((p) => {
        const isCurrent = p.id === currentPlayerId;
        return (
          <div
            key={p.id}
            data-expanded={expandedId === p.id || undefined}
            onClick={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.3rem 0.55rem",
              borderRadius: "var(--hh-radius-sm)",
              background: isCurrent ? "var(--hh-bg-elevated)" : "transparent",
              border: isCurrent ? "1px solid var(--hh-accent-dim)" : "1px solid transparent",
              transition: "background 0.2s var(--hh-ease), border-color 0.2s var(--hh-ease)",
              cursor: "pointer",
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
            <span
              className="hh-chip-name"
              style={{ fontWeight: isCurrent ? 700 : 500, whiteSpace: "nowrap" }}
            >
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
                gap: "0.45rem",
                alignItems: "center",
              }}
            >
              <span title="Resource cards">🃏 {p.handCount}</span>
              <span className="hh-chip-extra" title="Development cards">
                🎴 {p.devCardCount}
              </span>
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
