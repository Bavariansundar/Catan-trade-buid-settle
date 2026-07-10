import { useState } from "react";
import {
  RESOURCE_TYPES,
  type GameView,
  type ResourceHand,
  type ResourceType,
} from "@hexhaven/engine";

export interface MaritimeTradeCandidate {
  readonly give: ResourceType;
  readonly get: ResourceType;
}

export interface TradeDialogProps {
  readonly view: GameView;
  readonly viewerId: string;
  readonly maritimeTrades: readonly MaritimeTradeCandidate[];
  readonly nameFor: (playerId: string) => string;
  readonly onClose: () => void;
  readonly onMaritimeTrade: (give: ResourceType, get: ResourceType) => void;
  readonly onProposeTrade: (
    offering: Partial<ResourceHand>,
    requesting: Partial<ResourceHand>,
  ) => void;
  readonly onAcceptTrade: (tradeId: string) => void;
  readonly onRejectTrade: (tradeId: string) => void;
  readonly onCancelTrade: (tradeId: string) => void;
}

function ResourceStepper({
  hand,
  onChange,
}: {
  hand: Partial<ResourceHand>;
  onChange: (resource: ResourceType, delta: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      {RESOURCE_TYPES.map((r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8rem", width: 44 }}>{r}</span>
          <button
            type="button"
            className="hh-button hh-button--secondary"
            onClick={() => onChange(r, -1)}
          >
            −
          </button>
          <span style={{ width: 18, textAlign: "center" }}>{hand[r] ?? 0}</span>
          <button
            type="button"
            className="hh-button hh-button--secondary"
            onClick={() => onChange(r, 1)}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}

export function TradeDialog({
  view,
  viewerId,
  maritimeTrades,
  nameFor,
  onClose,
  onMaritimeTrade,
  onProposeTrade,
  onAcceptTrade,
  onRejectTrade,
  onCancelTrade,
}: TradeDialogProps) {
  const [offering, setOffering] = useState<Partial<ResourceHand>>({});
  const [requesting, setRequesting] = useState<Partial<ResourceHand>>({});

  function bump(setter: typeof setOffering, resource: ResourceType, delta: number) {
    setter((prev) => {
      const next = Math.max(0, (prev[resource] ?? 0) + delta);
      return { ...prev, [resource]: next };
    });
  }

  const myOffers = [...view.tradeOffers.values()].filter((o) => o.proposerId === viewerId);
  const incomingOffers = [...view.tradeOffers.values()].filter(
    (o) =>
      o.proposerId !== viewerId &&
      (o.targetPlayerIds === null || o.targetPlayerIds.includes(viewerId)) &&
      !o.rejectedBy.includes(viewerId),
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 900,
      }}
      onClick={onClose}
    >
      <div
        className="hh-card"
        style={{
          width: 420,
          maxWidth: "92vw",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.1rem" }}>Trade</h3>
          <button type="button" className="hh-button hh-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div>
          <h4 style={{ fontSize: "0.9rem", marginBottom: "0.4rem" }}>Bank / Port (maritime)</h4>
          {maritimeTrades.length === 0 && (
            <div style={{ color: "var(--hh-text-dim)", fontSize: "0.85rem" }}>
              No maritime trades available.
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {maritimeTrades.map(({ give, get }) => (
              <button
                key={`${give}-${get}`}
                type="button"
                className="hh-button hh-button--secondary"
                onClick={() => onMaritimeTrade(give, get)}
              >
                {give} → {get}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: "0.9rem", marginBottom: "0.4rem" }}>Propose to other players</h4>
          <div style={{ fontSize: "0.8rem", color: "var(--hh-text-dim)", marginBottom: "0.2rem" }}>
            You give:
          </div>
          <ResourceStepper hand={offering} onChange={(r, d) => bump(setOffering, r, d)} />
          <div
            style={{ fontSize: "0.8rem", color: "var(--hh-text-dim)", margin: "0.4rem 0 0.2rem" }}
          >
            You want:
          </div>
          <ResourceStepper hand={requesting} onChange={(r, d) => bump(setRequesting, r, d)} />
          <button
            type="button"
            className="hh-button"
            style={{ marginTop: "0.6rem" }}
            onClick={() => {
              onProposeTrade(offering, requesting);
              setOffering({});
              setRequesting({});
            }}
          >
            Propose to everyone
          </button>
        </div>

        {myOffers.length > 0 && (
          <div>
            <h4 style={{ fontSize: "0.9rem" }}>Your open offers</h4>
            {myOffers.map((o) => (
              <div
                key={o.id}
                style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}
              >
                <span>
                  give {JSON.stringify(o.offering)} for {JSON.stringify(o.requesting)}
                </span>
                <button
                  type="button"
                  className="hh-button hh-button--secondary"
                  onClick={() => onCancelTrade(o.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        {incomingOffers.length > 0 && (
          <div>
            <h4 style={{ fontSize: "0.9rem" }}>Offers from others</h4>
            {incomingOffers.map((o) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  {nameFor(o.proposerId)}: give {JSON.stringify(o.offering)} for{" "}
                  {JSON.stringify(o.requesting)}
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button type="button" className="hh-button" onClick={() => onAcceptTrade(o.id)}>
                    Accept
                  </button>
                  <button
                    type="button"
                    className="hh-button hh-button--secondary"
                    onClick={() => onRejectTrade(o.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
