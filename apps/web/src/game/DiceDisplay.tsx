export interface DiceDisplayProps {
  readonly roll: readonly [number, number] | null;
}

function Die({ value }: { value: number }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: "#f4ecd8",
        color: "#1a1305",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "1.1rem",
      }}
    >
      {value}
    </div>
  );
}

export function DiceDisplay({ roll }: DiceDisplayProps) {
  if (!roll) return <div style={{ color: "var(--hh-text-dim)" }}>No roll yet</div>;
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <Die value={roll[0]} />
      <Die value={roll[1]} />
      <span style={{ color: "var(--hh-text-dim)" }}>= {roll[0] + roll[1]}</span>
    </div>
  );
}
