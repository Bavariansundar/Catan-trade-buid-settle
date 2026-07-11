import { Link, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/authStore.js";

export function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.2rem",
          padding: "0.75rem 1.25rem",
          borderBottom: "1px solid var(--hh-border)",
          flexWrap: "wrap",
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: "var(--hh-font-display)",
            fontSize: "1.3rem",
            textDecoration: "none",
            color: "var(--hh-text)",
          }}
        >
          Hexhaven
        </Link>
        <nav style={{ display: "flex", gap: "1rem", fontSize: "0.9rem" }}>
          <Link to="/play">Single Player</Link>
          {user && <Link to="/lobbies">Lobbies</Link>}
          {user && <Link to="/history">History</Link>}
          <Link to="/rules">Rules</Link>
        </nav>
        <div style={{ marginLeft: "auto", fontSize: "0.9rem" }}>
          {user ? <Link to="/profile">{user.displayName}</Link> : <Link to="/login">Sign In</Link>}
        </div>
      </header>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}
