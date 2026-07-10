import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ACHIEVEMENT_INFO,
  getProfile,
  type AchievementId,
  type ProfileSummary,
} from "../api/profile.js";
import { useAuthStore } from "../store/authStore.js";

const ACHIEVEMENT_ENTRIES = Object.entries(ACHIEVEMENT_INFO) as [
  AchievementId,
  (typeof ACHIEVEMENT_INFO)[AchievementId],
][];

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void getProfile(accessToken).then(setSummary);
  }, [accessToken]);

  if (!user) return <div className="hh-card">Sign in to view your profile.</div>;

  const winRate =
    summary && summary.stats.gamesPlayed > 0
      ? Math.round((summary.stats.gamesWon / summary.stats.gamesPlayed) * 100)
      : null;
  const unlockedIds = new Set(summary?.achievements.map((a) => a.achievementId) ?? []);

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "3rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <h2>Profile</h2>
        <div>
          <strong>{user.displayName}</strong>
        </div>
        <div style={{ color: "var(--hh-text-dim)" }}>{user.email}</div>
        <button
          type="button"
          className="hh-button hh-button--secondary"
          onClick={() => {
            void logout().then(() => navigate("/"));
          }}
        >
          Sign Out
        </button>
      </div>

      {summary && (
        <div
          className="hh-card"
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          <h3 style={{ fontSize: "1rem" }}>Career Stats</h3>
          <div>
            {summary.stats.gamesWon} wins / {summary.stats.gamesPlayed} games played
            {winRate !== null && ` (${winRate}%)`}
          </div>
          {Object.keys(summary.stats.ratingByPlayerCount).length > 0 && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {Object.entries(summary.stats.ratingByPlayerCount).map(([playerCount, rating]) => (
                <div key={playerCount} style={{ fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--hh-text-dim)" }}>{playerCount}-player rating: </span>
                  <strong>{rating}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <h3 style={{ fontSize: "1rem" }}>Achievements</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.6rem",
          }}
        >
          {ACHIEVEMENT_ENTRIES.map(([id, info]) => {
            const unlocked = unlockedIds.has(id);
            return (
              <div
                key={id}
                style={{
                  padding: "0.6rem",
                  borderRadius: "var(--hh-radius-sm)",
                  border: "1px solid var(--hh-border)",
                  opacity: unlocked ? 1 : 0.4,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {unlocked ? "🏆" : "🔒"} {info.name}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--hh-text-dim)" }}>
                  {info.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
