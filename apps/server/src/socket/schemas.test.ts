import {
  gameActionSchema,
  gameWatchSchema,
  lobbyAddBotSchema,
  lobbyChatSchema,
} from "./schemas.js";

describe("gameWatchSchema", () => {
  it("accepts lastSeenSeq: -1 — the client's real 'no replay yet' sentinel", () => {
    // Regression: apps/web's MultiplayerGameScreen starts lastSeenSeqRef at
    // -1 and sends it on the very first game:watch. An earlier version of
    // this schema used .nonnegative(), which rejected -1 and silently broke
    // every multiplayer game load (caught by the e2e suite, not a unit test
    // — this test exists so it can't regress silently again).
    const result = gameWatchSchema.safeParse({ gameId: "game-1", lastSeenSeq: -1 });
    expect(result.success).toBe(true);
  });

  it("rejects lastSeenSeq below -1", () => {
    const result = gameWatchSchema.safeParse({ gameId: "game-1", lastSeenSeq: -2 });
    expect(result.success).toBe(false);
  });

  it("accepts an absent lastSeenSeq", () => {
    const result = gameWatchSchema.safeParse({ gameId: "game-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing gameId", () => {
    const result = gameWatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("gameActionSchema", () => {
  it("accepts any action-shaped object with a string type", () => {
    const result = gameActionSchema.safeParse({
      gameId: "game-1",
      action: { type: "ROLL_DICE", playerId: "p1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an action with no type", () => {
    const result = gameActionSchema.safeParse({ gameId: "game-1", action: { playerId: "p1" } });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object action", () => {
    const result = gameActionSchema.safeParse({ gameId: "game-1", action: "ROLL_DICE" });
    expect(result.success).toBe(false);
  });
});

describe("lobbyChatSchema", () => {
  it("rejects a non-string message instead of letting .trim() throw", () => {
    const result = lobbyChatSchema.safeParse({ lobbyId: "lobby-1", message: { evil: true } });
    expect(result.success).toBe(false);
  });
});

describe("lobbyAddBotSchema", () => {
  it("rejects a difficulty outside the known enum", () => {
    const result = lobbyAddBotSchema.safeParse({
      lobbyId: "lobby-1",
      seatIndex: 1,
      difficulty: "IMPOSSIBLE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a seat index out of range", () => {
    const result = lobbyAddBotSchema.safeParse({
      lobbyId: "lobby-1",
      seatIndex: 99,
      difficulty: "EASY",
    });
    expect(result.success).toBe(false);
  });
});
