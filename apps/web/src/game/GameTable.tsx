import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  Action,
  Edge,
  GameView,
  Hex,
  PlayerId,
  ResourceHand,
  ResourceType,
  Vertex,
} from "@baychearsbar/engine";
import { hexEquals } from "@baychearsbar/engine";
import type { LegalActionsSummary } from "../worker/protocol.js";
import { HexBoard } from "../board/HexBoard.js";
import { playerColorMap } from "../board/playerColors.js";
import { ActionCluster, PrimaryAction, type BuildMode } from "./ActionBar.js";
import { DevCardBar } from "./DevCardBar.js";
import { DiceDisplay } from "./DiceDisplay.js";
import { DiscardPicker } from "./DiscardPicker.js";
import { PlayerPanel } from "./PlayerPanel.js";
import { ResourceHandBar } from "./ResourceHandBar.js";
import { TradeDialog } from "./TradeDialog.js";

export interface GameTableProps {
  readonly view: GameView;
  readonly viewerId: PlayerId;
  readonly legalActions: LegalActionsSummary;
  readonly nameFor: (playerId: string) => string;
  readonly dispatch: (action: Action) => void;
}

/**
 * Full-screen game layout: the board fills the container and every other
 * control floats above it as an overlay (player chips + status on top,
 * resource tray + primary action at the bottom, an expandable action
 * cluster bottom-right) — see docs/architecture/mobile-ux.md.
 */
export function GameTable({ view, viewerId, legalActions, nameFor, dispatch }: GameTableProps) {
  const playerColors = useMemo(() => playerColorMap(view.players.map((p) => p.id)), [view.players]);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
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
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
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

      <div className="hh-hud-top">
        <PlayerPanel view={view} playerColors={playerColors} nameFor={nameFor} />
        <div className="hh-hud-panel hh-status-pill">
          <span className="hh-badge">Turn {view.turnNumber}</span>
          <DiceDisplay roll={view.diceRoll} />
          <span style={{ fontSize: "0.8rem", color: "var(--hh-text-dim)", whiteSpace: "nowrap" }}>
            Target {view.targetVictoryPoints} VP
          </span>
        </div>

        {view.phase.name === "setup" && isMyTurn && (
          <div className="hh-card hh-hud-banner">
            {view.phase.awaitingRoad
              ? "Place a road connected to your settlement."
              : "Place a settlement on a highlighted spot."}
          </div>
        )}
        {mandatoryRobberMove && (
          <div className="hh-card hh-hud-banner">Move the robber — tap a highlighted hex.</div>
        )}
        {playingKnight && (
          <div className="hh-card hh-hud-banner">Playing Knight — tap a highlighted hex.</div>
        )}
        {robberVictimChoice && (
          <div className="hh-card hh-hud-banner">
            <div>Choose who to steal from:</div>
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
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
          <div className="hh-card hh-hud-banner">
            Road Building: pick {2 - roadBuildingEdges.length} more road(s) on the board.
          </div>
        )}
        {!inSetup && buildMode && (
          <div
            className="hh-card hh-hud-banner"
            style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
          >
            <span>Placing {buildMode} — tap a highlighted spot.</span>
            <button
              type="button"
              className="hh-button hh-button--secondary"
              onClick={() => setBuildMode(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {devPanelOpen && view.phase.name === "main" && me?.devCards && me.devCards.length > 0 && (
        <div className="hh-hud-devcards">
          <DevCardBar
            cards={me.devCards}
            playableTypes={legalActions.playableDevCardTypes}
            onPlayKnight={() => {
              setPlayingKnight(true);
              setDevPanelOpen(false);
            }}
            onPlayMonopoly={(resource: ResourceType) => {
              dispatch({ type: "PLAY_DEV_CARD", card: "monopoly", playerId: viewerId, resource });
              setDevPanelOpen(false);
            }}
            onPlayYearOfPlenty={(a, b) => {
              dispatch({
                type: "PLAY_DEV_CARD",
                card: "year_of_plenty",
                playerId: viewerId,
                resources: [a, b],
              });
              setDevPanelOpen(false);
            }}
            onPlayRoadBuilding={() => {
              setRoadBuildingEdges([]);
              setDevPanelOpen(false);
            }}
          />
        </div>
      )}

      {me?.hand && (
        <div className="hh-hud-tray">
          <button
            type="button"
            className="hh-menu-fab"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          {view.phase.name === "main" && me.devCards && me.devCards.length > 0 && (
            <button
              type="button"
              className="hh-menu-fab"
              style={{ fontSize: "0.85rem" }}
              aria-label="Development cards"
              aria-expanded={devPanelOpen}
              onClick={() => setDevPanelOpen((o) => !o)}
            >
              🎴{me.devCards.length}
            </button>
          )}
          <div className="hh-hud-panel hh-tray-resources">
            <ResourceHandBar hand={me.hand} />
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <PrimaryAction
              phaseName={view.phase.name}
              isMyTurn={isMyTurn}
              onRoll={() => dispatch({ type: "ROLL_DICE", playerId: viewerId })}
              onEndTurn={() => dispatch({ type: "END_TURN", playerId: viewerId })}
            />
          </div>
        </div>
      )}

      <ActionCluster
        phaseName={view.phase.name}
        buildMode={buildMode}
        canBuildRoad={legalActions.roadEdgeIds.length > 0}
        canBuildSettlement={legalActions.settlementVertexIds.length > 0}
        canBuildCity={legalActions.cityVertexIds.length > 0}
        canBuyDevCard={legalActions.canBuyDevCard}
        onSetBuildMode={setBuildMode}
        onOpenTrade={() => setTradeOpen(true)}
        onBuyDevCard={() => dispatch({ type: "BUY_DEV_CARD", playerId: viewerId })}
      />

      {menuOpen && (
        <div className="hh-card hh-menu-sheet">
          <Link to="/" onClick={() => setMenuOpen(false)}>
            🏠 Leave game
          </Link>
          <Link to="/rules" onClick={() => setMenuOpen(false)}>
            📖 Rules
          </Link>
        </div>
      )}

      {inDiscardPhase && owedDiscard > 0 && me?.hand && (
        <div className="hh-modal-backdrop">
          <div className="hh-anim-pop-in" style={{ width: 480, maxWidth: "94vw" }}>
            <DiscardPicker
              hand={me.hand}
              owed={owedDiscard}
              onDiscard={(resources: Partial<ResourceHand>) =>
                dispatch({ type: "DISCARD", playerId: viewerId, resources })
              }
            />
          </div>
        </div>
      )}

      {tradeOpen && me?.hand && (
        <TradeDialog
          view={view}
          viewerId={viewerId}
          myHand={me.hand}
          maritimeTrades={legalActions.maritimeTrades}
          nameFor={nameFor}
          onClose={() => setTradeOpen(false)}
          onMaritimeTrade={(give, get) =>
            dispatch({ type: "MARITIME_TRADE", playerId: viewerId, give, get })
          }
          onProposeTrade={(offering, requesting, targetPlayerIds) =>
            dispatch({
              type: "PROPOSE_TRADE",
              playerId: viewerId,
              offering,
              requesting,
              targetPlayerIds: [...targetPlayerIds],
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
    </div>
  );
}
