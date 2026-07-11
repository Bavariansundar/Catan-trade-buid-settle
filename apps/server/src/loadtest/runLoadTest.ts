/**
 * Phase 11 load test: drives N games concurrently through the real
 * `GameRuntimeService` pipeline (per-game async lock, cache read/write,
 * append-only action log, auto-advance) — the same path every real action
 * takes, minus the Socket.IO/HTTP transport itself (which is separately
 * exercised, at much smaller scale, by the integration tests). In-memory
 * repositories stand in for Postgres/Redis, same as every other phase's
 * testing in this sandbox — see docs/technical-debt.md for what that does
 * and doesn't tell us about a real deployment.
 *
 * Run with: npx tsx src/loadtest/runLoadTest.ts [gameCount] [playersPerGame]
 */
import { randomUUID } from "node:crypto";
import { RuleBasedBot, resolveActingPlayerId } from "@hexhaven/bots";
import type { LobbyRecord, LobbySeatRecord } from "../domain/types.js";
import { loadConfig } from "../config.js";
import { InMemoryGameRepository } from "../game/gameRepository.js";
import { GameRuntimeService } from "../game/gameRuntime.js";
import { InMemoryGameStateCache } from "../game/gameStateCache.js";

const GAME_COUNT = Number(process.argv[2] ?? 100);
const PLAYERS_PER_GAME = Number(process.argv[3] ?? 3);

function fakeLobby(index: number): LobbyRecord {
  const seats: LobbySeatRecord[] = Array.from({ length: PLAYERS_PER_GAME }, (_, seatIndex) => ({
    id: randomUUID(),
    lobbyId: `loadtest-lobby-${String(index)}`,
    seatIndex,
    userId: `loadtest-player-${String(index)}-${String(seatIndex)}`,
    botDifficulty: null,
    isReady: true,
  }));
  return {
    id: `loadtest-lobby-${String(index)}`,
    code: null,
    isPublic: true,
    hostUserId: seats[0]!.userId!,
    status: "WAITING",
    targetVictoryPoints: 10,
    enabledModuleIds: [],
    turnTimerSeconds: 120,
    createdAt: new Date(),
    seats,
  };
}

async function driveOneGame(
  gameRuntime: GameRuntimeService,
  lobby: LobbyRecord,
  bot: RuleBasedBot,
): Promise<{ actions: number; ok: boolean; error?: string }> {
  let actions = 0;
  try {
    const { gameId } = await gameRuntime.startGame(lobby);
    for (let i = 0; i < 5000; i++) {
      const loaded = await gameRuntime.loadGame(gameId);
      if (loaded.state.phase.name === "ended") return { actions, ok: true };
      const actingPlayerId = resolveActingPlayerId(loaded.state);
      const action = bot.chooseAction(loaded.state, actingPlayerId, loaded.modules);
      const result = await gameRuntime.submitAction(gameId, actingPlayerId, action);
      actions += 1;
      if ("code" in result) {
        return { actions, ok: false, error: `${result.code}: ${result.message}` };
      }
    }
    return { actions, ok: false, error: "exceeded 5000-action safety cap without ending" };
  } catch (error) {
    return { actions, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const config = loadConfig({
    JWT_ACCESS_SECRET: "loadtest-access-secret",
    JWT_REFRESH_SECRET: "loadtest-refresh-secret",
  });
  const gameRepository = new InMemoryGameRepository();
  const cache = new InMemoryGameStateCache();
  const gameRuntime = new GameRuntimeService(gameRepository, cache, config);
  const bot = new RuleBasedBot();

  console.log(
    `Driving ${String(GAME_COUNT)} concurrent ${String(PLAYERS_PER_GAME)}-player games...`,
  );
  const memBefore = process.memoryUsage().rss;
  const wallStart = performance.now();

  const results = await Promise.all(
    Array.from({ length: GAME_COUNT }, (_, i) => driveOneGame(gameRuntime, fakeLobby(i), bot)),
  );

  const wallMs = performance.now() - wallStart;
  const memAfter = process.memoryUsage().rss;

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const totalActions = results.reduce((sum, r) => sum + r.actions, 0);

  console.log("");
  console.log("=== Load test results ===");
  console.log(
    `Games:          ${String(GAME_COUNT)} (${String(succeeded.length)} ok, ${String(failed.length)} failed)`,
  );
  console.log(`Total actions:  ${String(totalActions)}`);
  console.log(`Wall time:      ${(wallMs / 1000).toFixed(2)}s`);
  console.log(`Throughput:     ${(totalActions / (wallMs / 1000)).toFixed(1)} actions/sec`);
  console.log(`Avg game time:  ${(wallMs / GAME_COUNT).toFixed(1)}ms`);
  console.log(`RSS before:     ${(memBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`RSS after:      ${(memAfter / 1024 / 1024).toFixed(1)} MB`);
  console.log(`RSS delta:      ${((memAfter - memBefore) / 1024 / 1024).toFixed(1)} MB`);

  if (failed.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.error ?? "unknown"}`);
    process.exitCode = 1;
  }
}

void main();
