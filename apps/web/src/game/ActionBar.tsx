export type BuildMode = "road" | "settlement" | "city" | null;

export interface ActionBarProps {
  readonly phaseName: string;
  readonly isMyTurn: boolean;
  readonly buildMode: BuildMode;
  readonly canBuildRoad: boolean;
  readonly canBuildSettlement: boolean;
  readonly canBuildCity: boolean;
  readonly onRoll: () => void;
  readonly onEndTurn: () => void;
  readonly onSetBuildMode: (mode: BuildMode) => void;
  readonly onOpenTrade: () => void;
}

export function ActionBar({
  phaseName,
  isMyTurn,
  buildMode,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  onRoll,
  onEndTurn,
  onSetBuildMode,
  onOpenTrade,
}: ActionBarProps) {
  return (
    <div
      className="hh-card"
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
    >
      {phaseName === "roll" && isMyTurn && (
        <button type="button" className="hh-button" onClick={onRoll}>
          Roll Dice
        </button>
      )}
      {(phaseName === "main" || phaseName === "specialBuild") && (
        <>
          <button
            type="button"
            className={buildMode === "road" ? "hh-button" : "hh-button hh-button--secondary"}
            disabled={!canBuildRoad}
            onClick={() => onSetBuildMode(buildMode === "road" ? null : "road")}
          >
            Build Road
          </button>
          <button
            type="button"
            className={buildMode === "settlement" ? "hh-button" : "hh-button hh-button--secondary"}
            disabled={!canBuildSettlement}
            onClick={() => onSetBuildMode(buildMode === "settlement" ? null : "settlement")}
          >
            Build Settlement
          </button>
          <button
            type="button"
            className={buildMode === "city" ? "hh-button" : "hh-button hh-button--secondary"}
            disabled={!canBuildCity}
            onClick={() => onSetBuildMode(buildMode === "city" ? null : "city")}
          >
            Build City
          </button>
          <button type="button" className="hh-button hh-button--secondary" onClick={onOpenTrade}>
            Trade
          </button>
        </>
      )}
      {phaseName === "main" && isMyTurn && (
        <button
          type="button"
          className="hh-button hh-button--secondary"
          onClick={onEndTurn}
          style={{ marginLeft: "auto" }}
        >
          End Turn
        </button>
      )}
    </div>
  );
}
