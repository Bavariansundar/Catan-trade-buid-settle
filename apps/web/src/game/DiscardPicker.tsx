import { useState } from "react";
import { RESOURCE_TYPES, type ResourceHand, type ResourceType } from "@baychearsbar/engine";
import { ResourceHandBar } from "./ResourceHandBar.js";

export interface DiscardPickerProps {
  readonly hand: ResourceHand;
  readonly owed: number;
  readonly onDiscard: (resources: Partial<ResourceHand>) => void;
}

export function DiscardPicker({ hand, owed, onDiscard }: DiscardPickerProps) {
  const [picked, setPicked] = useState<Partial<ResourceHand>>({});
  const total = RESOURCE_TYPES.reduce((sum, r) => sum + (picked[r] ?? 0), 0);

  function add(resource: ResourceType) {
    if (total >= owed) return;
    if ((picked[resource] ?? 0) >= hand[resource]) return;
    setPicked((prev) => ({ ...prev, [resource]: (prev[resource] ?? 0) + 1 }));
  }

  return (
    <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <h3 style={{ fontSize: "1rem" }}>
        Discard {owed} cards ({total}/{owed} selected)
      </h3>
      <ResourceHandBar hand={hand} selected={picked} onSelect={add} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="hh-button hh-button--secondary"
          onClick={() => setPicked({})}
        >
          Reset
        </button>
        <button
          type="button"
          className="hh-button"
          disabled={total !== owed}
          onClick={() => onDiscard(picked)}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
