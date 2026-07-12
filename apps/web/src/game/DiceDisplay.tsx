export interface DiceDisplayProps {
  readonly roll: readonly [number, number] | null;
}

function Die({ value }: { value: number }) {
  return (
    <div
      className="hh-anim-pop-in"
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: "linear-gradient(165deg, #faf1dd 0%, #e9dcbc 100%)",
        color: "#241505",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontFamily: "var(--hh-font-display)",
        fontSize: "1.05rem",
        boxShadow: "var(--hh-shadow-sm), inset 0 1px 0 rgba(255,255,255,0.6)",
        border: "1px solid rgba(0,0,0,0.15)",
      }}
    >
      {value}
    </div>
  );
}

export function DiceDisplay({ roll }: DiceDisplayProps) {
  if (!roll)
    return <div style={{ color: "var(--hh-text-faint)", fontSize: "0.85rem" }}>No roll yet</div>;
  return (
    <div
      key={`${roll[0]}-${roll[1]}`}
      style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}
    >
      <Die value={roll[0]} />
      <Die value={roll[1]} />
      <span style={{ color: "var(--hh-text-dim)", fontWeight: 600 }}>= {roll[0] + roll[1]}</span>
    </div>
  );
}
