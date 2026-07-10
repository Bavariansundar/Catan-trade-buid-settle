import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { createApp } from "./app.js";
import { AuthService } from "./auth/authService.js";
import { PrismaRefreshTokenRepository } from "./auth/refreshTokenRepository.js";
import { PrismaUserRepository } from "./auth/userRepository.js";
import { loadConfig } from "./config.js";
import { PrismaGameRepository } from "./game/gameRepository.js";
import { GameRuntimeService } from "./game/gameRuntime.js";
import { RedisGameStateCache } from "./game/gameStateCache.js";
import { PrismaLobbyRepository } from "./lobby/lobbyRepository.js";
import { LobbyService } from "./lobby/lobbyService.js";
import { createSocketServer } from "./socket/server.js";
import { PrismaAchievementRepository } from "./stats/achievementRepository.js";
import { HistoryService } from "./stats/historyService.js";
import { MatchRecorder } from "./stats/matchRecorder.js";
import { PrismaPlayerStatsRepository } from "./stats/playerStatsRepository.js";
import { ProfileService } from "./stats/profileService.js";

const config = loadConfig();
const prisma = new PrismaClient();
const redis = new Redis(config.redisUrl);

const authService = new AuthService(
  new PrismaUserRepository(prisma),
  new PrismaRefreshTokenRepository(prisma),
  config,
);
const lobbyService = new LobbyService(new PrismaLobbyRepository(prisma));
const cache = new RedisGameStateCache(redis);
const gameRepository = new PrismaGameRepository(prisma);
const playerStatsRepository = new PrismaPlayerStatsRepository(prisma);
const achievementRepository = new PrismaAchievementRepository(prisma);
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
  console.log(`server listening on port ${String(config.port)}`);
});
