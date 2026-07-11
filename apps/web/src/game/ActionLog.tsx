import type { RedactedGameEvent } from "@hexhaven/engine";
import { formatEvent } from "./formatEvent.js";

export interface ActionLogProps {
  readonly log: readonly RedactedGameEvent[];
  readonly nameFor: (playerId: string) => string;
}

export function ActionLog({ log, nameFor }: ActionLogProps) {
  return (
    <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <h3 style={{ fontSize: "1rem" }}>Action Log</h3>
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column-reverse",
          gap: "0.25rem",
        }}
      >
        {[...log]
          .slice(-100)
          .reverse()
          .map((event, i) => (
            <div
              key={`${event.type}-${i}-${log.length}`}
              style={{ fontSize: "0.85rem", color: "var(--hh-text-dim)" }}
            >
              {formatEvent(event, nameFor)}
            </div>
          ))}
      </div>
    </div>
  );
}
