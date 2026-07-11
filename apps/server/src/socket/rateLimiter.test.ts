import { createEventRateLimiter } from "./rateLimiter.js";

describe("createEventRateLimiter", () => {
  it("allows events under the per-window limit", () => {
    const isAllowed = createEventRateLimiter({ windowMs: 1000, maxEventsPerWindow: 5 });
    for (let i = 0; i < 5; i++) {
      expect(isAllowed("socket-1")).toBe(true);
    }
  });

  it("rejects events once the per-window limit is exceeded", () => {
    const isAllowed = createEventRateLimiter({ windowMs: 1000, maxEventsPerWindow: 5 });
    for (let i = 0; i < 5; i++) isAllowed("socket-1");
    expect(isAllowed("socket-1")).toBe(false);
  });

  it("tracks each key's window independently", () => {
    const isAllowed = createEventRateLimiter({ windowMs: 1000, maxEventsPerWindow: 2 });
    expect(isAllowed("socket-1")).toBe(true);
    expect(isAllowed("socket-1")).toBe(true);
    expect(isAllowed("socket-1")).toBe(false);
    expect(isAllowed("socket-2")).toBe(true); // a different key's budget is untouched
  });

  it("resets the count once a new window starts", async () => {
    const isAllowed = createEventRateLimiter({ windowMs: 10, maxEventsPerWindow: 2 });
    expect(isAllowed("socket-1")).toBe(true);
    expect(isAllowed("socket-1")).toBe(true);
    expect(isAllowed("socket-1")).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(isAllowed("socket-1")).toBe(true);
  });
});
