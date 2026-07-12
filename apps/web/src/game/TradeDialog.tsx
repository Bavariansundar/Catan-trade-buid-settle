import { useState } from "react";
import {
  RESOURCE_TYPES,
  type GameView,
  type ResourceHand,
  type ResourceType,
} from "@baychearsbar/engine";
import { ResourceIcon } from "./ResourceIcon.js";

export interface MaritimeTradeCandidate {
  readonly give: ResourceType;
  readonly get: ResourceType;
}

export interface TradeDialogProps {
  readonly view: GameView;
  readonly viewerId: string;
  readonly myHand: ResourceHand;
  readonly maritimeTrades: readonly MaritimeTradeCandidate[];
  readonly nameFor: (playerId: string) => string;
  readonly onClose: () => void;
  readonly onMaritimeTrade: (give: ResourceType, get: ResourceType) => void;
  readonly onProposeTrade: (
    offering: Partial<ResourceHand>,
    requesting: Partial<ResourceHand>,
    targetPlayerIds: readonly string[],
  ) => void;
  readonly onAcceptTrade: (tradeId: string) => void;
  readonly onRejectTrade: (tradeId: string) => void;
  readonly onCancelTrade: (tradeId: string) => void;
}

/** Resource cards with a live stepper — shows what you actually hold ("have 2") and grays out anything you're out of. */
function ResourcePickerGrid({
  values,
  caps,
  onChange,
}: {
  values: Partial<ResourceHand>;
  /** Owned counts, used as both the displayed "have N" hint and the max you can offer. Omit for unlimited (the "want" side). */
  caps?: ResourceHand;
  onChange: (resource: ResourceType, delta: number) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
        gap: "0.5rem",
      }}
    >
      {RESOURCE_TYPES.map((r) => {
        const owned = caps?.[r];
        const isEmpty = caps !== undefined && owned === 0;
        const value = values[r] ?? 0;
        const atCap = caps !== undefined && value >= (owned ?? 0);
        return (
          <div key={r} className="hh-trade-card" data-empty={isEmpty || undefined}>
            <ResourceIcon type={r} size={30} />
            <div className="hh-trade-card-name">{r}</div>
            {caps !== undefined && <div className="hh-trade-card-owned">have {owned ?? 0}</div>}
            <div className="hh-trade-card-stepper">
              <button
                type="button"
                className="hh-trade-step-btn"
                disabled={value === 0}
                onClick={() => onChange(r, -1)}
              >
                −
              </button>
              <span className="hh-trade-step-value">{value}</span>
              <button
                type="button"
                className="hh-trade-step-btn"
                disabled={isEmpty || atCap}
                onClick={() => onChange(r, 1)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResourceSummary({ hand }: { hand: Partial<ResourceHand> }) {
  const entries = RESOURCE_TYPES.filter((r) => (hand[r] ?? 0) > 0);
  if (entries.length === 0) return <span style={{ color: "var(--hh-text-faint)" }}>nothing</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
      {entries.map((r) => (
        <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <ResourceIcon type={r} size={18} /> {hand[r]}
        </span>
      ))}
    </span>
  );
}

export function TradeDialog({
  view,
  viewerId,
  myHand,
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
  const otherPlayerIds = view.players.map((p) => p.id).filter((id) => id !== viewerId);
  // Defaults to everyone selected — matches the old "propose to everyone" behavior unless narrowed.
  const [targetIds, setTargetIds] = useState<Set<string>>(() => new Set(otherPlayerIds));

  function bump(setter: typeof setOffering, resource: ResourceType, delta: number) {
    setter((prev) => {
      const next = Math.max(0, (prev[resource] ?? 0) + delta);
      return { ...prev, [resource]: next };
    });
  }

  function toggleTarget(playerId: string) {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
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
        background: "rgba(10, 6, 2, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 900,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="hh-card hh-card--hero hh-anim-pop-in"
        style={{
          width: 480,
          maxWidth: "94vw",
          maxHeight: "88vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.1rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.15rem", textTransform: "none", letterSpacing: 0 }}>
            <span style={{ fontFamily: "var(--hh-font-display)", color: "var(--hh-accent-hi)" }}>
              Trade
            </span>
          </h3>
          <button type="button" className="hh-button hh-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div>
          <h4 className="hh-trade-section-title">Bank &amp; Ports</h4>
          {maritimeTrades.length === 0 ? (
            <div style={{ color: "var(--hh-text-dim)", fontSize: "0.85rem" }}>
              No maritime trades available.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {maritimeTrades.map(({ give, get }) => (
                <button
                  key={`${give}-${get}`}
                  type="button"
                  className="hh-button hh-button--secondary"
                  onClick={() => onMaritimeTrade(give, get)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.95rem",
                  }}
                >
                  <ResourceIcon type={give} size={20} /> →{" "}
                  <ResourceIcon type={get} size={20} />
                </button>
              ))}
            </div>
          )}
        </div>

        <hr className="hh-divider" />

        <div>
          <h4 className="hh-trade-section-title">Propose to other players</h4>

          <div className="hh-trade-subheading">You give</div>
          <ResourcePickerGrid values={offering} caps={myHand} onChange={(r, d) => bump(setOffering, r, d)} />

          <div className="hh-trade-subheading" style={{ marginTop: "0.7rem" }}>
            You want
          </div>
          <ResourcePickerGrid values={requesting} onChange={(r, d) => bump(setRequesting, r, d)} />

          <div className="hh-trade-subheading" style={{ marginTop: "0.7rem" }}>
            Offer to
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {otherPlayerIds.map((id) => {
              const selected = targetIds.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleTarget(id)}
                  className={selected ? "hh-button" : "hh-button hh-button--secondary"}
                  style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                >
                  {selected ? "✓ " : ""}
                  {nameFor(id)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="hh-button"
            style={{ marginTop: "0.7rem", width: "100%" }}
            disabled={targetIds.size === 0}
            onClick={() => {
              onProposeTrade(offering, requesting, [...targetIds]);
              setOffering({});
              setRequesting({});
            }}
          >
            {targetIds.size === otherPlayerIds.length
              ? "Propose to everyone"
              : targetIds.size === 0
                ? "Select at least one player"
                : `Propose to ${targetIds.size} player${targetIds.size === 1 ? "" : "s"}`}
          </button>
        </div>

        {myOffers.length > 0 && (
          <>
            <hr className="hh-divider" />
            <div>
              <h4 className="hh-trade-section-title">Your open offers</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {myOffers.map((o) => {
                  const targets = o.targetPlayerIds ?? otherPlayerIds;
                  return (
                    <div key={o.id} className="hh-trade-offer-card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.85rem",
                        }}
                      >
                        <span>
                          <ResourceSummary hand={o.offering} /> <strong>for</strong>{" "}
                          <ResourceSummary hand={o.requesting} />
                        </span>
                        <button
                          type="button"
                          className="hh-button hh-button--secondary"
                          onClick={() => onCancelTrade(o.id)}
                        >
                          Cancel
                        </button>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.4rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        {targets.map((pid) => {
                          const rejected = o.rejectedBy.includes(pid);
                          return (
                            <span
                              key={pid}
                              className="hh-badge"
                              style={
                                rejected
                                  ? { color: "var(--hh-danger)", borderColor: "var(--hh-danger-dim)" }
                                  : undefined
                              }
                            >
                              {nameFor(pid)} · {rejected ? "✕ Rejected" : "⏳ Pending"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {incomingOffers.length > 0 && (
          <>
            <hr className="hh-divider" />
            <div>
              <h4 className="hh-trade-section-title">Offers from others</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {incomingOffers.map((o) => (
                  <div key={o.id} className="hh-trade-offer-card">
                    <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                      <strong>{nameFor(o.proposerId)}</strong> offers{" "}
                      <ResourceSummary hand={o.offering} /> <strong>for</strong>{" "}
                      <ResourceSummary hand={o.requesting} />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="hh-button"
                        onClick={() => onAcceptTrade(o.id)}
                      >
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
