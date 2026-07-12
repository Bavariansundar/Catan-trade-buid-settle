import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "@baychearsbar/engine";
import { GameTable } from "../game/GameTable.js";
import {
  clearSinglePlayerGame,
  loadSinglePlayerGame,
  saveSinglePlayerGame,
  type SinglePlayerSave,
} from "../persistence/db.js";
import type { BotDifficulty } from "../worker/protocol.js";
import { useEngineWorker, type SinglePlayerConfig } from "../worker/useEngineWorker.js";

const HUMAN_ID = "you";
const BOT_IDS = ["bot-1", "bot-2", "bot-3"];

interface SeatConfig {
  readonly playerCount: number;
  readonly difficulties: BotDifficulty[];
  readonly targetVictoryPoints: number;
}

function buildConfig(seats: SeatConfig): SinglePlayerConfig {
  const botIds = BOT_IDS.slice(0, seats.playerCount - 1);
  const botDifficulties: Record<string, BotDifficulty> = {};
  botIds.forEach((id, i) => {
    botDifficulties[id] = seats.difficulties[i] ?? "EASY";
  });
  return {
    playerIds: [HUMAN_ID, ...botIds],
    humanPlayerId: HUMAN_ID,
    seed: `sp-${Date.now()}`,
    targetVictoryPoints: seats.targetVictoryPoints,
    botDifficulties,
  };
}

function nameForFactory(playerIds: readonly string[]) {
  return (id: string) => (id === HUMAN_ID ? "You" : `Bot ${playerIds.indexOf(id)}`);
}

export function SinglePlayerScreen() {
  const [config, setConfig] = useState<SinglePlayerConfig | null>(null);
  const [playerCount, setPlayerCount] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("MEDIUM");
  const [savedGame, setSavedGame] = useState<SinglePlayerSave | null>(null);
  const [checkedForSave, setCheckedForSave] = useState(false);

  const actionsRef = useRef<Action[]>([]);

  useEffect(() => {
    void loadSinglePlayerGame().then((save) => {
      setSavedGame(save);
      setCheckedForSave(true);
    });
  }, []);

  const handleActionsApplied = useCallback((actions: readonly Action[]) => {
    actionsRef.current = [...actionsRef.current, ...actions];
  }, []);

  const engine = useEngineWorker(config, handleActionsApplied);

  // Persist after every batch of applied actions; drop the save once the game ends.
  const lastSavedActionCountRef = useRef(0);
  if (config && actionsRef.current.length !== lastSavedActionCountRef.current) {
    lastSavedActionCountRef.current = actionsRef.current.length;
    if (engine.gameOver) {
      void clearSinglePlayerGame();
    } else {
      void saveSinglePlayerGame({
        config,
        actions: actionsRef.current,
        savedAt: new Date().toISOString(),
      });
    }
  }

  function startNew() {
    actionsRef.current = [];
    lastSavedActionCountRef.current = 0;
    setSavedGame(null);
    setConfig(
      buildConfig({
        playerCount,
        difficulties: Array.from({ length: playerCount - 1 }, () => difficulty),
        targetVictoryPoints: 10,
      }),
    );
  }

  function resume(save: SinglePlayerSave) {
    actionsRef.current = [...save.actions];
    lastSavedActionCountRef.current = save.actions.length;
    setConfig({ ...save.config, resumeActions: save.actions });
  }

  if (!config || !engine.view || !engine.legalActions) {
    return (
      <div
        className="hh-card"
        style={{
          maxWidth: 420,
          margin: "3rem auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2>Single Player</h2>
        {checkedForSave && savedGame && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ color: "var(--hh-text-dim)", fontSize: "0.85rem" }}>
              Saved game from {new Date(savedGame.savedAt).toLocaleString()}
            </div>
            <button type="button" className="hh-button" onClick={() => resume(savedGame)}>
              Resume Game
            </button>
          </div>
        )}
        <label>
          Players
          <select
            className="hh-input"
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          Bot difficulty
          <select
            className="hh-input"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <button type="button" className="hh-button hh-button--secondary" onClick={startNew}>
          Start New Game
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem", height: "100%" }}>
      <GameTable
        view={engine.view}
        viewerId={config.humanPlayerId}
        legalActions={engine.legalActions}
        nameFor={nameForFactory(config.playerIds)}
        dispatch={engine.dispatch}
      />
    </div>
  );
}
