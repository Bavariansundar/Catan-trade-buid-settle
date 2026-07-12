import { Link } from "react-router-dom";
import { Logo } from "../game/Logo.js";
import { useAuthStore } from "../store/authStore.js";

const FEATURES = [
  {
    icon: "⬢",
    title: "Settle & Expand",
    body: "Claim the richest hexes, chain settlements into cities, and race for the longest road.",
  },
  {
    icon: "⚖",
    title: "Trade & Bargain",
    body: "Broker deals with rivals or the harbor markets — every resource is leverage.",
  },
  {
    icon: "🛡",
    title: "Three Expansions",
    body: "Sail open seas, command knights, and defend against barbarians in original rule modules.",
  },
  {
    icon: "🤖",
    title: "Adaptive AI",
    body: "Three bot tiers, from casual rule-based play to determinized tree search under time pressure.",
  },
];

/** Decorative repeating hex-outline backdrop for the hero — pure CSS/SVG, no external assets. */
function HexPattern() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.1,
        pointerEvents: "none",
      }}
    >
      <defs>
        <pattern
          id="hh-hero-hexes"
          width="64"
          height="55.4"
          patternUnits="userSpaceOnUse"
          patternTransform="translate(0,0)"
        >
          <polygon
            points="32,0 64,16 64,44 32,60 0,44 0,16"
            fill="none"
            stroke="var(--hh-accent)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hh-hero-hexes)" />
    </svg>
  );
}

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "5rem 1.5rem 4rem",
          textAlign: "center",
          background:
            "radial-gradient(ellipse 900px 500px at 50% 0%, #3a2a16 0%, transparent 65%)",
          borderBottom: "1px solid var(--hh-border)",
        }}
      >
        <HexPattern />
        <div
          className="hh-anim-fade-in-up"
          style={{
            position: "relative",
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          <div style={{ margin: "0 auto", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.5))" }}>
            <Logo size={72} />
          </div>
          <div
            className="hh-badge"
            style={{ margin: "0 auto", background: "var(--hh-bg-panel-hi)" }}
          >
            2–6 Players · Single Player vs Bots
          </div>
          <h1
            style={{
              fontSize: "clamp(2.6rem, 6vw, 4.2rem)",
              lineHeight: 1.05,
              background: "linear-gradient(180deg, var(--hh-accent-hi), var(--hh-accent))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            BayCheArsBar
          </h1>
          <p
            style={{
              color: "var(--hh-text-dim)",
              fontSize: "1.15rem",
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            An original settlement-trading game of hexes, harbors, and hard bargains — built for
            long nights around the table, online or off.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.9rem",
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: "0.75rem",
            }}
          >
            <Link
              to="/play"
              className="hh-button"
              style={{
                textDecoration: "none",
                fontSize: "1.05rem",
                padding: "0.85rem 1.9rem",
              }}
            >
              Play Offline vs Bots
            </Link>
            {user ? (
              <Link
                to="/lobbies"
                className="hh-button hh-button--secondary"
                style={{ textDecoration: "none", fontSize: "1.05rem", padding: "0.85rem 1.9rem" }}
              >
                Multiplayer Lobbies
              </Link>
            ) : (
              <Link
                to="/login"
                className="hh-button hh-button--secondary"
                style={{ textDecoration: "none", fontSize: "1.05rem", padding: "0.85rem 1.9rem" }}
              >
                Sign In for Multiplayer
              </Link>
            )}
          </div>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "3.5rem 1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="hh-card hh-anim-fade-in-up"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              animationDelay: `${i * 0.08}s`,
            }}
          >
            <div
              style={{
                fontSize: "1.6rem",
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--hh-radius-sm)",
                background: "var(--hh-bg-elevated)",
                border: "1px solid var(--hh-border-hi)",
                color: "var(--hh-accent-hi)",
              }}
            >
              {f.icon}
            </div>
            <h3 style={{ fontSize: "0.85rem" }}>{f.title}</h3>
            <p style={{ color: "var(--hh-text-dim)", fontSize: "0.9rem", margin: 0 }}>{f.body}</p>
          </div>
        ))}
      </section>

      {user && (
        <section
          style={{
            maxWidth: 1080,
            margin: "0 auto 3.5rem",
            padding: "0 1.5rem",
            display: "flex",
            gap: "0.9rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            to="/profile"
            className="hh-button hh-button--secondary"
            style={{ textDecoration: "none" }}
          >
            Profile
          </Link>
          <Link
            to="/history"
            className="hh-button hh-button--secondary"
            style={{ textDecoration: "none" }}
          >
            Match History
          </Link>
        </section>
      )}
    </div>
  );
}
