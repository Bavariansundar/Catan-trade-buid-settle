import { useState } from "react";
import {
  RESOURCE_TYPES,
  type DevCardInstance,
  type DevCardType,
  type ResourceType,
} from "@baychearsbar/engine";

const DEV_CARD_LABEL: Record<DevCardType, string> = {
  knight: "Knight",
  victory_point: "Victory Point",
  monopoly: "Monopoly",
  road_building: "Road Building",
  year_of_plenty: "Year of Plenty",
};

export interface DevCardBarProps {
  readonly cards: readonly DevCardInstance[];
  readonly playableTypes: readonly Exclude<DevCardType, "victory_point">[];
  readonly onPlayKnight: () => void;
  readonly onPlayMonopoly: (resource: ResourceType) => void;
  readonly onPlayYearOfPlenty: (a: ResourceType, b: ResourceType) => void;
  readonly onPlayRoadBuilding: () => void;
}

/** Buying is handled by the floating "+" button in GameTable — this only lists cards already owned. */
export function DevCardBar({
  cards,
  playableTypes,
  onPlayKnight,
  onPlayMonopoly,
  onPlayYearOfPlenty,
  onPlayRoadBuilding,
}: DevCardBarProps) {
  const [monopolyPick, setMonopolyPick] = useState<ResourceType | "">("");
  const [yopPick, setYopPick] = useState<[ResourceType, ResourceType] | null>(null);

  const counts = new Map<DevCardType, number>();
  for (const c of cards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);

  return (
    <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <h3>Development Cards</h3>
      {[...counts.entries()].map(([type, count]) => (
        <div
          key={type}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.9rem",
          }}
        >
          <span>
            {DEV_CARD_LABEL[type]} × {count}
          </span>
          {type !== "victory_point" && playableTypes.includes(type) && (
            <>
              {type === "knight" && (
                <button
                  type="button"
                  className="hh-button hh-button--secondary"
                  onClick={onPlayKnight}
                >
                  Play
                </button>
              )}
              {type === "road_building" && (
                <button
                  type="button"
                  className="hh-button hh-button--secondary"
                  onClick={onPlayRoadBuilding}
                >
                  Play
                </button>
              )}
              {type === "monopoly" && (
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <select
                    className="hh-input"
                    value={monopolyPick}
                    onChange={(e) => setMonopolyPick(e.target.value as ResourceType)}
                  >
                    <option value="">resource…</option>
                    {RESOURCE_TYPES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="hh-button hh-button--secondary"
                    disabled={!monopolyPick}
                    onClick={() => monopolyPick && onPlayMonopoly(monopolyPick)}
                  >
                    Play
                  </button>
                </div>
              )}
              {type === "year_of_plenty" && (
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <select
                    className="hh-input"
                    onChange={(e) =>
                      setYopPick([
                        e.target.value as ResourceType,
                        yopPick?.[1] ?? RESOURCE_TYPES[0]!,
                      ])
                    }
                  >
                    <option value="">resource 1…</option>
                    {RESOURCE_TYPES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    className="hh-input"
                    onChange={(e) =>
                      setYopPick([
                        yopPick?.[0] ?? RESOURCE_TYPES[0]!,
                        e.target.value as ResourceType,
                      ])
                    }
                  >
                    <option value="">resource 2…</option>
                    {RESOURCE_TYPES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="hh-button hh-button--secondary"
                    disabled={!yopPick}
                    onClick={() => yopPick && onPlayYearOfPlenty(yopPick[0], yopPick[1])}
                  >
                    Play
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
