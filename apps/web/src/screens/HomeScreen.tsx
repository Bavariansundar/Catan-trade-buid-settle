import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  return (
    <div
      style={{
        maxWidth: 520,
        margin: "4rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <div>
        <h1 style={{ fontSize: "2.4rem" }}>Hexhaven</h1>
        <p style={{ color: "var(--hh-text-dim)" }}>
          An original settlement-trading game for 2–6 players.
        </p>
      </div>
      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Link
          to="/play"
          className="hh-button"
          style={{ textAlign: "center", textDecoration: "none" }}
        >
          Play offline vs Bots
        </Link>
        {user ? (
          <Link
            to="/lobbies"
            className="hh-button hh-button--secondary"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Multiplayer Lobbies
          </Link>
        ) : (
          <Link
            to="/login"
            className="hh-button hh-button--secondary"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Sign in for Multiplayer
          </Link>
        )}
        {user && (
          <Link
            to="/profile"
            className="hh-button hh-button--secondary"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Profile
          </Link>
        )}
      </div>
    </div>
  );
}
