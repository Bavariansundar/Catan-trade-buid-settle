import { createServer } from "node:http";
import { createApp } from "./app.js";
import { AuthService } from "./auth/authService.js";
import { InMemoryRefreshTokenRepository } from "./auth/refreshTokenRepository.js";
import { InMemoryUserRepository } from "./auth/userRepository.js";
import { loadConfig } from "./config.js";
import { InMemoryGameRepository } from "./game/gameRepository.js";
import { GameRuntimeService } from "./game/gameRuntime.js";
import { InMemoryGameStateCache } from "./game/gameStateCache.js";
import { InMemoryLobbyRepository } from "./lobby/lobbyRepository.js";
import { LobbyService } from "./lobby/lobbyService.js";
import { createSocketServer } from "./socket/server.js";
import { InMemoryAchievementRepository } from "./stats/achievementRepository.js";
import { HistoryService } from "./stats/historyService.js";
import { MatchRecorder } from "./stats/matchRecorder.js";
import { InMemoryPlayerStatsRepository } from "./stats/playerStatsRepository.js";
import { ProfileService } from "./stats/profileService.js";

/**
 * A fully in-memory-backed server (see docs/architecture/server.md §0),
 * used only by apps/web's Playwright multiplayer e2e test — it needs a real
 * running server, but this repo has no live Postgres/Redis in CI/sandboxed
 * environments. Never used in production (see src/index.ts for that).
 */
const config = loadConfig({
  PORT: process.env["PORT"] ?? "3002",
  JWT_ACCESS_SECRET: "e2e-access-secret",
  JWT_REFRESH_SECRET: "e2e-refresh-secret",
});

const authService = new AuthService(
  new InMemoryUserRepository(),
  new InMemoryRefreshTokenRepository(),
  config,
);
const lobbyService = new LobbyService(new InMemoryLobbyRepository());
const cache = new InMemoryGameStateCache();
const gameRepository = new InMemoryGameRepository();
const playerStatsRepository = new InMemoryPlayerStatsRepository();
const achievementRepository = new InMemoryAchievementRepository();
const matchRecorder = new MatchRecorder(
  gameRepository,
  playerStatsRepository,
  achievementRepository,
);
const gameRuntime = new GameRuntimeService(gameRepository, cache, config, matchRecorder);
const historyService = new HistoryService(gameRepository);
const profileService = new ProfileService(playerStatsRepository, achievementRepository);

const app = createApp({ config, authService, lobbyService, historyService, profileService });
const httpServer = createServer(app);
createSocketServer(httpServer, { config, lobbyService, gameRuntime, cache });

httpServer.listen(config.port, () => {
  console.log(`e2e test server listening on port ${String(config.port)}`);
});
