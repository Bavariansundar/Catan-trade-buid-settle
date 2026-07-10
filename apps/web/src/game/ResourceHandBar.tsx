import { RESOURCE_TYPES, type ResourceHand, type ResourceType } from "@hexhaven/engine";

const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛰️",
};

export interface ResourceHandBarProps {
  readonly hand: ResourceHand;
  readonly selected?: Partial<ResourceHand>;
  readonly onSelect?: (resource: ResourceType) => void;
}

export function ResourceHandBar({ hand, selected, onSelect }: ResourceHandBarProps) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {RESOURCE_TYPES.map((r) => (
        <button
          key={r}
          type="button"
          className="hh-button hh-button--secondary"
          disabled={!onSelect || hand[r] === 0}
          onClick={() => onSelect?.(r)}
          style={{ minWidth: 64, padding: "0.4rem 0.5rem" }}
        >
          <div style={{ fontSize: "1.2rem" }}>{RESOURCE_ICON[r]}</div>
          <div style={{ fontSize: "0.8rem" }}>
            {r}: {hand[r]}
            {selected?.[r] ? ` (−${selected[r]})` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}
