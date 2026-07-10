/** Match-history APIs + replay viewer land in Phase 10 (see PROMPTS.md). */
export function HistoryScreen() {
  return (
    <div className="hh-card" style={{ maxWidth: 480, margin: "3rem auto" }}>
      <h2>Match History</h2>
      <p style={{ color: "var(--hh-text-dim)" }}>
        Match history and the replay viewer are coming in a later phase, once the server exposes a
        match-history API.
      </p>
    </div>
  );
}
