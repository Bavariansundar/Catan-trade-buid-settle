import { useState } from "react";

export type BuildMode = "road" | "settlement" | "city" | null;

export interface PrimaryActionProps {
  readonly phaseName: string;
  readonly isMyTurn: boolean;
  readonly onRoll: () => void;
  readonly onEndTurn: () => void;
}

/** The single contextual "what you do next" button, shown in the bottom tray. */
export function PrimaryAction({ phaseName, isMyTurn, onRoll, onEndTurn }: PrimaryActionProps) {
  if (!isMyTurn) return null;
  if (phaseName === "roll") {
    return (
      <button
        type="button"
        className="hh-button"
        style={{ fontSize: "1rem", padding: "0.7rem 1.4rem", whiteSpace: "nowrap" }}
        onClick={onRoll}
      >
        🎲 Roll Dice
      </button>
    );
  }
  if (phaseName === "main") {
    return (
      <button
        type="button"
        className="hh-button hh-button--secondary"
        style={{ padding: "0.7rem 1.2rem", whiteSpace: "nowrap" }}
        onClick={onEndTurn}
      >
        End Turn
      </button>
    );
  }
  return null;
}

export interface ActionClusterProps {
  readonly phaseName: string;
  readonly buildMode: BuildMode;
  readonly canBuildRoad: boolean;
  readonly canBuildSettlement: boolean;
  readonly canBuildCity: boolean;
  readonly canBuyDevCard: boolean;
  readonly onSetBuildMode: (mode: BuildMode) => void;
  readonly onOpenTrade: () => void;
  readonly onBuyDevCard: () => void;
}

/**
 * Expandable "+" stack (bottom-right, above the tray) holding the build,
 * trade, and dev-card-buy actions — see docs/architecture/mobile-ux.md §3.
 * Like the old flat ActionBar, it renders whenever building is possible
 * (main phase or a 5–6-player special build phase) and lets the per-action
 * `can*` flags handle disabling, rather than gating on whose turn it is.
 */
export function ActionCluster({
  phaseName,
  buildMode,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuyDevCard,
  onSetBuildMode,
  onOpenTrade,
  onBuyDevCard,
}: ActionClusterProps) {
  const [open, setOpen] = useState(false);
  if (phaseName !== "main" && phaseName !== "specialBuild") return null;

  function pick(mode: Exclude<BuildMode, null>) {
    onSetBuildMode(buildMode === mode ? null : mode);
    setOpen(false);
  }

  return (
    <div className="hh-fab-cluster">
      {open && (
        <>
          <button
            type="button"
            className="hh-fab-item"
            data-active={buildMode === "road" || undefined}
            disabled={!canBuildRoad}
            onClick={() => pick("road")}
          >
            🛣️ Road
          </button>
          <button
            type="button"
            className="hh-fab-item"
            data-active={buildMode === "settlement" || undefined}
            disabled={!canBuildSettlement}
            onClick={() => pick("settlement")}
          >
            🏠 Settlement
          </button>
          <button
            type="button"
            className="hh-fab-item"
            data-active={buildMode === "city" || undefined}
            disabled={!canBuildCity}
            onClick={() => pick("city")}
          >
            🏰 City
          </button>
          <button
            type="button"
            className="hh-fab-item"
            onClick={() => {
              onOpenTrade();
              setOpen(false);
            }}
          >
            ⇄ Trade
          </button>
          <button
            type="button"
            className="hh-fab-item"
            disabled={!canBuyDevCard}
            title="Buy development card — 1 ore, 1 wheat, 1 sheep"
            onClick={() => {
              onBuyDevCard();
              setOpen(false);
            }}
          >
            🎴 Buy Dev Card
          </button>
        </>
      )}
      <button
        type="button"
        className="hh-dev-buy-fab"
        aria-label={open ? "Close actions" : "Open actions"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "+"}
      </button>
    </div>
  );
}
