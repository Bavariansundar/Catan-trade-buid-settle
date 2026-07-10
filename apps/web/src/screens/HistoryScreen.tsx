import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listHistory, type GameRecord } from "../api/history.js";
import { useAuthStore } from "../store/authStore.js";

export function HistoryScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    void listHistory(accessToken, cursor ? { cursor } : {})
      .then((page) => {
        setGames((prev) => (cursor ? [...prev, ...page.items] : [...page.items]));
        setNextCursor(page.nextCursor);
      })
      .finally(() => setLoading(false));
  }, [accessToken, cursor]);

  if (!accessToken) return <div className="hh-card">Sign in to view your match history.</div>;

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "2rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <h2>Match History</h2>
      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {games.length === 0 && !loading && (
          <div style={{ color: "var(--hh-text-dim)" }}>No games played yet.</div>
        )}
        {games.map((game) => (
          <div
            key={game.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>
              {game.configJson.seatPlayerIds.length} players · {game.status}
              {game.startedAt ? ` · ${new Date(game.startedAt).toLocaleDateString()}` : ""}
            </span>
            <Link
              to={`/history/${game.id}`}
              className="hh-button hh-button--secondary"
              style={{ textDecoration: "none" }}
            >
              View
            </Link>
          </div>
        ))}
        {nextCursor && (
          <button
            type="button"
            className="hh-button hh-button--secondary"
            disabled={loading}
            onClick={() => setCursor(nextCursor)}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
