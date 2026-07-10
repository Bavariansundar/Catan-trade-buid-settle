import { useEffect, useState } from "react";
import type { GameEvent } from "@hexhaven/engine";
import { formatEvent } from "./formatEvent.js";

interface ToastEntry {
  readonly id: number;
  readonly text: string;
}

let nextId = 0;

export interface ToastsProps {
  readonly latestEvents: readonly GameEvent[];
  readonly nameFor: (playerId: string) => string;
}

/** Transient toasts for the most recent batch of events; auto-dismiss after a few seconds. */
export function Toasts({ latestEvents, nameFor }: ToastsProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    if (latestEvents.length === 0) return;
    const entries = latestEvents.map((e) => ({ id: nextId++, text: formatEvent(e, nameFor) }));
    setToasts((prev) => [...prev, ...entries]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !entries.some((e) => e.id === t.id)));
    }, 4000);
    return () => clearTimeout(timer);
  }, [latestEvents, nameFor]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        zIndex: 1000,
        maxWidth: 320,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="hh-card"
          style={{
            padding: "0.5rem 0.8rem",
            fontSize: "0.85rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
