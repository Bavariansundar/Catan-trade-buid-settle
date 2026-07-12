import { jest } from "@jest/globals";
import { legalRoadEdges, legalSettlementVertices } from "@baychearsbar/bots";
import { isRuleError } from "@baychearsbar/engine";
import { loadConfig } from "../config.js";
import type { LobbyRecord } from "../domain/types.js";
import { InMemoryGameRepository } from "./gameRepository.js";
import { GameRuntimeService } from "./gameRuntime.js";
import { InMemoryGameStateCache } from "./gameStateCache.js";

function buildConfig() {
  return loadConfig({
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  });
}

function buildLobby(overrides: Partial<LobbyRecord> = {}): LobbyRecord {
  return {
    id: "lobby-1",
    code: null,
    isPublic: true,
    hostUserId: "human-1",
    status: "STARTED",
    targetVictoryPoints: 10,
    enabledModuleIds: [],
    turnTimerSeconds: 120,
    createdAt: new Date(),
    seats: [
      {
        id: "seat-0",
        lobbyId: "lobby-1",
        seatIndex: 0,
        userId: "human-1",
        botDifficulty: null,
        isReady: true,
      },
      {
        id: "seat-1",
        lobbyId: "lobby-1",
        seatIndex: 1,
        userId: null,
        botDifficulty: "EASY",
        isReady: false,
      },
    ],
    ...overrides,
  };
}

function buildRuntime() {
  const games = new InMemoryGameRepository();
  const cache = new InMemoryGameStateCache();
  const runtime = new GameRuntimeService(games, cache, buildConfig());
  return { games, cache, runtime };
}

async function playThroughSetup(runtime: GameRuntimeService, gameId: string, humanId: string) {
  // Drives only the *human*'s setup steps for real — the bot seat's steps
  // are expected to auto-play on their own via GameRuntimeService.advance().
  for (let i = 0; i < 20; i++) {
    const loaded = await runtime.loadGame(gameId);
    if (loaded.state.phase.name !== "setup") return loaded.state;
    if (loaded.state.phase.order[loaded.state.phase.step] !== humanId) {
      throw new Error("Expected it to be the human's setup turn, but the bot didn't auto-play");
    }
    if (!loaded.state.phase.awaitingRoad) {
      const vertex = legalSettlementVertices(loaded.state, humanId)[0]!;
      const result = await runtime.submitAction(gameId, humanId, {
        type: "PLACE_SETTLEMENT",
        playerId: humanId,
        vertex,
      });
      if (isRuleError(result)) throw new Error(`Unexpected rejection: ${result.code}`);
    } else {
      const edge = legalRoadEdges(loaded.state, humanId)[0]!;
      const result = await runtime.submitAction(gameId, humanId, {
        type: "PLACE_ROAD",
        playerId: humanId,
        edge,
      });
      if (isRuleError(result)) throw new Error(`Unexpected rejection: ${result.code}`);
    }
  }
  throw new Error("Setup did not complete in time");
}

describe("GameRuntimeService", () => {
  it("starts a game and auto-plays the bot seat's setup turns", async () => {
    const { runtime, games } = buildRuntime();
    const lobby = buildLobby();
    const { gameId, state } = await runtime.startGame(lobby);
    expect(state.phase.name).toBe("setup");

    const finalSetupState = await playThroughSetup(runtime, gameId, "human-1");
    expect(finalSetupState.phase.name).toBe("roll");

    // Both the human's and the bot's setup actions should be in the persisted log.
    const actions = await games.listActions(gameId);
    expect(actions.some((a) => a.playerId === "bot-seat-1")).toBe(true);
    expect(actions.some((a) => a.playerId === "human-1")).toBe(true);
  });

  it("rejects an illegal action without mutating state", async () => {
    const { runtime } = buildRuntime();
    const lobby = buildLobby();
    const { gameId } = await runtime.startGame(lobby);
    const result = await runtime.submitAction(gameId, "human-1", {
      type: "ROLL_DICE",
      playerId: "human-1",
    });
    expect(isRuleError(result)).toBe(true); // it's the setup phase, not roll
  });

  it("serializes two simultaneous conflicting actions for the same game — exactly one wins", async () => {
    const { runtime, games } = buildRuntime();
    const lobby = buildLobby();
    const { gameId, state } = await runtime.startGame(lobby);
    if (state.phase.name !== "setup") throw new Error("unreachable");

    const candidates = legalSettlementVertices(state, "human-1");
    const [vertexA, vertexB] = candidates;
    if (!vertexA || !vertexB) throw new Error("Test needs at least 2 legal candidate vertices");

    // Two different settlement placements for the same player's single
    // setup turn, fired without awaiting between them — only one should
    // ever apply; the loser must see the *post-winner* state (the
    // distance rule or "road expected" phase now blocks it), never a
    // corrupted/interleaved outcome.
    const [resultA, resultB] = await Promise.all([
      runtime.submitAction(gameId, "human-1", {
        type: "PLACE_SETTLEMENT",
        playerId: "human-1",
        vertex: vertexA,
      }),
      runtime.submitAction(gameId, "human-1", {
        type: "PLACE_SETTLEMENT",
        playerId: "human-1",
        vertex: vertexB,
      }),
    ]);
    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((r) => !isRuleError(r));
    const failures = outcomes.filter((r) => isRuleError(r));
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const loaded = await runtime.loadGame(gameId);
    expect(loaded.state.buildings.size).toBe(1);

    // No gaps/duplicates in the persisted log: exactly one PLACE_SETTLEMENT recorded for this step.
    const actions = await games.listActions(gameId);
    const settlementActions = actions.filter((a) => a.actionJson.type === "PLACE_SETTLEMENT");
    expect(settlementActions).toHaveLength(1);
    const seqs = actions.map((a) => a.seq);
    expect(seqs).toEqual([...new Set(seqs)].sort((a, b) => a - b));
  }, 30_000);

  it("auto-passes a connected-but-idle player's turn when the turn timer expires", async () => {
    jest.useFakeTimers();
    try {
      const { runtime, games } = buildRuntime();
      const lobby = buildLobby({ turnTimerSeconds: 5 });
      const { gameId } = await runtime.startGame(lobby);
      await playThroughSetup(runtime, gameId, "human-1");

      const rolled = await runtime.loadGame(gameId);
      expect(rolled.state.phase.name).toBe("roll");

      await jest.advanceTimersByTimeAsync(5_001);

      const afterTimeout = await runtime.loadGame(gameId);
      // The timer's ROLL_DICE (a real decision, not a "pass") should have been auto-resolved.
      const actions = await games.listActions(gameId);
      expect(
        actions.some((a) => a.actionJson.type === "ROLL_DICE" && a.playerId === "human-1"),
      ).toBe(true);
      void afterTimeout;
    } finally {
      jest.useRealTimers();
    }
  }, 30_000);

  it("takes over a disconnected player's decisions after the grace period", async () => {
    jest.useFakeTimers();
    try {
      const { runtime } = buildRuntime();
      const lobby = buildLobby();
      const { gameId } = await runtime.startGame(lobby);

      runtime.onDisconnect(gameId, "human-1");
      expect(runtime.isTakenOver(gameId, "human-1")).toBe(false);

      await jest.advanceTimersByTimeAsync(30_001);

      expect(runtime.isTakenOver(gameId, "human-1")).toBe(true);
      // Being mid-setup and disconnected, their setup placement should have auto-played.
      const loaded = await runtime.loadGame(gameId);
      expect(loaded.state.buildings.size).toBeGreaterThan(0);

      runtime.onReconnect(gameId, "human-1");
      expect(runtime.isTakenOver(gameId, "human-1")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  }, 30_000);
});
