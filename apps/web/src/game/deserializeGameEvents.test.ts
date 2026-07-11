import { describe, expect, it } from "vitest";
import { deserializeGameEvents } from "./deserializeGameEvents.js";

describe("deserializeGameEvents", () => {
  it("reconstructs RESOURCES_PRODUCED.production as a Map", () => {
    const wire = [
      { type: "RESOURCES_PRODUCED", production: [["a", { wood: 1 }], ["b", { ore: 2 }]] },
    ];
    const [event] = deserializeGameEvents(JSON.parse(JSON.stringify(wire)));
    expect(event!.type).toBe("RESOURCES_PRODUCED");
    if (event!.type !== "RESOURCES_PRODUCED") throw new Error("expected RESOURCES_PRODUCED");
    expect(event.production).toBeInstanceOf(Map);
    expect(event.production.get("a")).toEqual({ wood: 1 });
  });

  it("reconstructs MONOPOLY_PLAYED.seized as a Map", () => {
    const wire = [
      { type: "MONOPOLY_PLAYED", playerId: "a", resource: "ore", seized: [["b", 3]] },
    ];
    const [event] = deserializeGameEvents(JSON.parse(JSON.stringify(wire)));
    expect(event!.type).toBe("MONOPOLY_PLAYED");
    if (event!.type !== "MONOPOLY_PLAYED") throw new Error("expected MONOPOLY_PLAYED");
    expect(event.seized).toBeInstanceOf(Map);
    expect(event.seized.get("b")).toBe(3);
  });

  it("passes every other event through unchanged", () => {
    const wire = [{ type: "TURN_STARTED", playerId: "a" }];
    const events = deserializeGameEvents(JSON.parse(JSON.stringify(wire)));
    expect(events).toEqual(wire);
  });

  it("leaves an already-redacted event with a missing field alone", () => {
    const wire = [{ type: "DISCARDED", playerId: "a" }];
    const events = deserializeGameEvents(JSON.parse(JSON.stringify(wire)));
    expect(events[0]).toEqual({ type: "DISCARDED", playerId: "a" });
    expect(events[0]).not.toHaveProperty("resources");
  });
});
