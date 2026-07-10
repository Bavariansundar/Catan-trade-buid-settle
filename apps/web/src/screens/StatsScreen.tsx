/** Post-game stat charts land in Phase 10, once the match-history APIs exist (see PROMPTS.md). */
export function StatsScreen() {
  return (
    <div className="hh-card" style={{ maxWidth: 480, margin: "3rem auto" }}>
      <h2>Stats</h2>
      <p style={{ color: "var(--hh-text-dim)" }}>
        Post-game statistics and charts are coming in a later phase, once the server exposes
        match-history data.
      </p>
    </div>
  );
}
