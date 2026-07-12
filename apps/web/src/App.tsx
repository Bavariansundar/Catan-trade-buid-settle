import type { CSSProperties } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Logo } from "./game/Logo.js";
import { useAuthStore } from "./store/authStore.js";

const navLinkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
  color: isActive ? "var(--hh-accent-hi)" : "var(--hh-text-dim)",
  textDecoration: "none",
  fontSize: "0.85rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0.4rem 0.1rem",
  borderBottom: isActive ? "2px solid var(--hh-accent)" : "2px solid transparent",
  transition: "color 0.15s var(--hh-ease), border-color 0.15s var(--hh-ease)",
});

export function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.75rem",
          padding: "0.85rem 1.75rem",
          background: "linear-gradient(180deg, var(--hh-bg-panel-hi) 0%, var(--hh-bg) 100%)",
          borderBottom: "1px solid var(--hh-border)",
          boxShadow: "var(--hh-shadow-md)",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontFamily: "var(--hh-font-display)",
            fontSize: "1.5rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textDecoration: "none",
            color: "var(--hh-accent-hi)",
            textShadow: "0 1px 0 rgba(0,0,0,0.5)",
          }}
        >
          <Logo size={30} />
          BayCheArsBar
        </Link>
        <nav style={{ display: "flex", gap: "1.5rem" }}>
          <NavLink to="/play" style={navLinkStyle}>
            Single Player
          </NavLink>
          {user && (
            <NavLink to="/lobbies" style={navLinkStyle}>
              Lobbies
            </NavLink>
          )}
          {user && (
            <NavLink to="/history" style={navLinkStyle}>
              History
            </NavLink>
          )}
          <NavLink to="/rules" style={navLinkStyle}>
            Rules
          </NavLink>
        </nav>
        <div style={{ marginLeft: "auto" }}>
          {user ? (
            <Link
              to="/profile"
              className="hh-badge"
              style={{ textDecoration: "none", fontSize: "0.78rem" }}
            >
              {user.displayName}
            </Link>
          ) : (
            <Link to="/login" className="hh-button hh-button--secondary" style={{ fontSize: "0.85rem" }}>
              Sign In
            </Link>
          )}
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
