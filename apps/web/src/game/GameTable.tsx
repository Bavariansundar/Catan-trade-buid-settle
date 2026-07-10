import { useMemo, useState } from "react";
import type {
  Action,
  Edge,
  GameEvent,
  GameView,
  Hex,
  PlayerId,
  ResourceHand,
  ResourceType,
  Vertex,
} from "@hexhaven/engine";
import { hexEquals } from "@hexhaven/engine";
import type { LegalActionsSummary } from "../worker/protocol.js";
import { HexBoard } from "../board/HexBoard.js";
import { playerColorMap } from "../board/playerColors.js";
import { ActionBar, type BuildMode } from "./ActionBar.js";
import { ActionLog } from "./ActionLog.js";
import { DevCardBar } from "./DevCardBar.js";
import { DiceDisplay } from "./DiceDisplay.js";
import { DiscardPicker } from "./DiscardPicker.js";
import { PlayerPanel } from "./PlayerPanel.js";
import { ResourceHandBar } from "./ResourceHandBar.js";
import { Toasts } from "./Toasts.js";
import { TradeDialog } from "./TradeDialog.js";

export interface GameTableProps {
  readonly view: GameView;
  readonly viewerId: PlayerId;
  readonly legalActions: LegalActionsSummary;
  readonly latestEvents: readonly GameEvent[];
  readonly log: readonly GameEvent[];
  readonly nameFor: (playerId: string) => string;
  readonly dispatch: (action: Action) => void;
}

export function GameTable({
  view,
  viewerId,
  legalActions,
  latestEvents,
  log,
  nameFor,
  dispatch,
}: GameTableProps) {
  const playerColors = useMemo(() => playerColorMap(view.players.map((p) => p.id)), [view.players]);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [playingKnight, setPlayingKnight] = useState(false);
  const [robberVictimChoice, setRobberVictimChoice] = useState<{
    hex: Hex;
    candidates: PlayerId[];
  } | null>(null);
  const [roadBuildingEdges, setRoadBuildingEdges] = useState<Edge[] | null>(null);

  const me = view.players.find((p) => p.id === viewerId);
  const isMyTurn = view.players[view.currentPlayerIndex]?.id === viewerId;
  const inSetup = view.phase.name === "setup";
  const inRobberPhase = view.phase.name === "robber";
  const inDiscardPhase = view.phase.name === "discard";
  const owedDiscard = inDiscardPhase ? (view.phase.pending.get(viewerId) ?? 0) : 0;
  const mandatoryRobberMove = inRobberPhase && isMyTurn;
  const robberActive = mandatoryRobberMove || playingKnight;

  const effectiveBuildMode: BuildMode = inSetup
    ? view.phase.awaitingRoad
      ? "road"
      : "settlement"
    : buildMode;

  const legalVertexIds = new Set(
    effectiveBuildMode === "settlement"
      ? legalActions.settlementVertexIds
      : effectiveBuildMode === "city"
        ? legalActions.cityVertexIds
        : [],
  );
  const legalEdgeIds = new Set(
    effectiveBuildMode === "road"
      ? legalActions.roadEdgeIds
      : roadBuildingEdges
        ? legalActions.roadEdgeIds.filter((id) => !roadBuildingEdges.some((e) => e.id === id))
        : [],
  );

  function handleVertexClick(vertex: Vertex) {
    if (inSetup) {
      dispatch({ type: "PLACE_SETTLEMENT", playerId: viewerId, vertex });
      return;
    }
    if (effectiveBuildMode === "settlement") {
      dispatch({ type: "BUILD_SETTLEMENT", playerId: viewerId, vertex });
      setBuildMode(null);
    } else if (effectiveBuildMode === "city") {
      dispatch({ type: "BUILD_CITY", playerId: viewerId, vertex });
      setBuildMode(null);
    }
  }

  function handleEdgeClick(edge: Edge) {
    if (inSetup) {
      dispatch({ type: "PLACE_ROAD", playerId: viewerId, edge });
      return;
    }
    if (roadBuildingEdges) {
      const nextEdges = [...roadBuildingEdges, edge];
      if (nextEdges.length >= 2) {
        dispatch({
          type: "PLAY_DEV_CARD",
          card: "road_building",
          playerId: viewerId,
          edges: nextEdges,
        });
        setRoadBuildingEdges(null);
      } else {
        setRoadBuildingEdges(nextEdges);
      }
      return;
    }
    if (effectiveBuildMode === "road") {
      dispatch({ type: "BUILD_ROAD", playerId: viewerId, edge });
      setBuildMode(null);
    }
  }

  function dispatchRobberAction(hex: Hex, stealFromPlayerId: PlayerId | null) {
    if (playingKnight) {
      dispatch({
        type: "PLAY_DEV_CARD",
        card: "knight",
        playerId: viewerId,
        hex,
        stealFromPlayerId,
      });
    } else {
      dispatch({ type: "MOVE_ROBBER", playerId: viewerId, hex, stealFromPlayerId });
    }
    setPlayingKnight(false);
    setRobberVictimChoice(null);
  }

  function handleHexClick(hex: Hex) {
    const candidates = legalActions.robberCandidates.filter((c) => hexEquals(c.hex, hex));
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      dispatchRobberAction(hex, candidates[0]!.stealFromPlayerId);
      return;
    }
    setRobberVictimChoice({
      hex,
      candidates: candidates
        .map((c) => c.stealFromPlayerId)
        .filter((id): id is PlayerId => id !== null),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ fontSize: "0.9rem", color: "var(--hh-text-dim)" }}>
          Turn {view.turnNumber} · Target {view.targetVictoryPoints} VP
        </div>
        <DiceDisplay roll={view.diceRoll} />
      </div>

      <div style={{ display: "flex", gap: "1rem", flex: 1, minHeight: 0, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "2 1 480px",
            minHeight: 360,
            background: "var(--hh-bg-panel)",
            borderRadius: "var(--hh-radius-md)",
          }}
        >
          <HexBoard
            view={view}
            playerColors={playerColors}
            legalVertexIds={legalVertexIds}
            legalEdgeIds={legalEdgeIds}
            onVertexClick={handleVertexClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={handleHexClick}
            robberSelectable={robberActive}
          />
        </div>

        <div
          style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <PlayerPanel view={view} playerColors={playerColors} nameFor={nameFor} />
          <ActionLog log={log} nameFor={nameFor} />
        </div>
      </div>

      {me?.hand && (
        <div
          className="hh-card"
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          <ResourceHandBar hand={me.hand} />
          <ActionBar
            phaseName={view.phase.name}
            isMyTurn={isMyTurn}
            buildMode={effectiveBuildMode}
            canBuildRoad={legalActions.roadEdgeIds.length > 0}
            canBuildSettlement={legalActions.settlementVertexIds.length > 0}
            canBuildCity={legalActions.cityVertexIds.length > 0}
            onRoll={() => dispatch({ type: "ROLL_DICE", playerId: viewerId })}
            onEndTurn={() => dispatch({ type: "END_TURN", playerId: viewerId })}
            onSetBuildMode={setBuildMode}
            onOpenTrade={() => setTradeOpen(true)}
          />
          {view.phase.name === "main" && me.devCards && (
            <DevCardBar
              cards={me.devCards}
              playableTypes={legalActions.playableDevCardTypes}
              canBuy={legalActions.canBuyDevCard}
              onBuy={() => dispatch({ type: "BUY_DEV_CARD", playerId: viewerId })}
              onPlayKnight={() => setPlayingKnight(true)}
              onPlayMonopoly={(resource: ResourceType) =>
                dispatch({ type: "PLAY_DEV_CARD", card: "monopoly", playerId: viewerId, resource })
              }
              onPlayYearOfPlenty={(a, b) =>
                dispatch({
                  type: "PLAY_DEV_CARD",
                  card: "year_of_plenty",
                  playerId: viewerId,
                  resources: [a, b],
                })
              }
              onPlayRoadBuilding={() => setRoadBuildingEdges([])}
            />
          )}
        </div>
      )}

      {inDiscardPhase && owedDiscard > 0 && me?.hand && (
        <DiscardPicker
          hand={me.hand}
          owed={owedDiscard}
          onDiscard={(resources: Partial<ResourceHand>) =>
            dispatch({ type: "DISCARD", playerId: viewerId, resources })
          }
        />
      )}

      {mandatoryRobberMove && (
        <div className="hh-card">Move the robber — click a highlighted hex.</div>
      )}
      {playingKnight && <div className="hh-card">Playing Knight — click a highlighted hex.</div>}

      {robberVictimChoice && (
        <div className="hh-card">
          <div>Choose who to steal from:</div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            {robberVictimChoice.candidates.map((pid) => (
              <button
                key={pid}
                type="button"
                className="hh-button hh-button--secondary"
                onClick={() => dispatchRobberAction(robberVictimChoice.hex, pid)}
              >
                {nameFor(pid)}
              </button>
            ))}
          </div>
        </div>
      )}

      {roadBuildingEdges && (
        <div className="hh-card">
          Road Building: pick {2 - roadBuildingEdges.length} more road(s) on the board.
        </div>
      )}

      {tradeOpen && (
        <TradeDialog
          view={view}
          viewerId={viewerId}
          maritimeTrades={legalActions.maritimeTrades}
          nameFor={nameFor}
          onClose={() => setTradeOpen(false)}
          onMaritimeTrade={(give, get) =>
            dispatch({ type: "MARITIME_TRADE", playerId: viewerId, give, get })
          }
          onProposeTrade={(offering, requesting) =>
            dispatch({
              type: "PROPOSE_TRADE",
              playerId: viewerId,
              offering,
              requesting,
              targetPlayerIds: null,
            })
          }
          onAcceptTrade={(tradeId) =>
            dispatch({ type: "ACCEPT_TRADE", playerId: viewerId, tradeId })
          }
          onRejectTrade={(tradeId) =>
            dispatch({ type: "REJECT_TRADE", playerId: viewerId, tradeId })
          }
          onCancelTrade={(tradeId) =>
            dispatch({ type: "CANCEL_TRADE", playerId: viewerId, tradeId })
          }
        />
      )}

      <Toasts latestEvents={latestEvents} nameFor={nameFor} />
    </div>
  );
}
