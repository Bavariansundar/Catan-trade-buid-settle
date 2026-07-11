import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { getGameDetail, type GameDetail } from "../api/history.js";
import { useAuthStore } from "../store/authStore.js";
import { HexBoard } from "../board/HexBoard.js";
import { deserializeGameView } from "../game/deserializeGameView.js";
import { playerColorMap } from "../board/playerColors.js";
import { PlayerPanel } from "../game/PlayerPanel.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);

function nameForFactory(participants: readonly { userId: string }[], viewerId: string) {
  return (id: string) => {
    if (id === viewerId) return "You";
    const index = participants.findIndex((p) => p.userId === id);
    return index >= 0 ? `Player ${index + 1}` : `Bot ${id.slice(-1)}`;
  };
}

export function GameDetailScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!accessToken || !gameId) return;
    getGameDetail(accessToken, gameId)
      .then((d) => {
        setDetail(d);
        setStep(0);
      })
      .catch(() => setError("Could not load this game."));
  }, [accessToken, gameId]);

  if (error) return <div className="hh-card">{error}</div>;
  if (!detail || !user) return <div className="hh-card">Loading…</div>;

  const nameFor = nameForFactory(detail.participants, user.id);
  const playerColors = playerColorMap(detail.game.configJson.seatPlayerIds);
  const currentStep = detail.replay[step] ?? detail.replay[0];
  const view = currentStep ? deserializeGameView(currentStep.view) : null;

  const stats = detail.stats;
  const diceLabels = Array.from({ length: 11 }, (_, i) => i + 2);
  const diceCounts = diceLabels.map((sum) => stats.diceFrequency[sum] ?? 0);

  const vpLabels = stats.vpProgression.map((s) => s.turnNumber);
  const vpDatasets = detail.game.configJson.seatPlayerIds.map((playerId) => ({
    label: nameFor(playerId),
    data: stats.vpProgression.map((s) => s.vpByPlayer[playerId] ?? 0),
    borderColor: playerColors[playerId],
    backgroundColor: playerColors[playerId],
  }));

  const resourceTypes = ["wood", "wheat", "sheep", "brick", "ore"] as const;
  const resourceDatasets = detail.game.configJson.seatPlayerIds.map((playerId) => ({
    label: nameFor(playerId),
    data: resourceTypes.map((r) => stats.resourcesGainedPerPlayer[playerId]?.[r] ?? 0),
    backgroundColor: playerColors[playerId],
  }));

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "1.5rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <h2>Game Replay &amp; Stats</h2>

      {view && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div
            style={{
              flex: "2 1 480px",
              minHeight: 360,
              background: "var(--hh-bg-panel)",
              borderRadius: "var(--hh-radius-md)",
            }}
          >
            <HexBoard view={view} playerColors={playerColors} />
          </div>
          <div
            style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <PlayerPanel view={view} playerColors={playerColors} nameFor={nameFor} />
            <div
              className="hh-card"
              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="hh-button hh-button--secondary"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  ◀ Prev
                </button>
                <span style={{ fontSize: "0.85rem" }}>
                  Step {step + 1} / {detail.replay.length}
                </span>
                <button
                  type="button"
                  className="hh-button hh-button--secondary"
                  disabled={step >= detail.replay.length - 1}
                  onClick={() => setStep((s) => Math.min(detail.replay.length - 1, s + 1))}
                >
                  Next ▶
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, detail.replay.length - 1)}
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div className="hh-card" style={{ flex: "1 1 320px" }}>
          <h3 style={{ fontSize: "1rem" }}>Dice Frequency</h3>
          <Bar
            data={{
              labels: diceLabels,
              datasets: [{ label: "Rolls", data: diceCounts, backgroundColor: "#f2a544" }],
            }}
            options={{ plugins: { legend: { display: false } } }}
          />
        </div>
        <div className="hh-card" style={{ flex: "1 1 320px" }}>
          <h3 style={{ fontSize: "1rem" }}>Victory Points Over Time</h3>
          <Line data={{ labels: vpLabels, datasets: vpDatasets }} />
        </div>
        <div className="hh-card" style={{ flex: "1 1 320px" }}>
          <h3 style={{ fontSize: "1rem" }}>Resources Gained</h3>
          <Bar
            data={{ labels: [...resourceTypes], datasets: resourceDatasets }}
            options={{ scales: { x: { stacked: false } } }}
          />
        </div>
      </div>
    </div>
  );
}
