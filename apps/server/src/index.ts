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
const gameRuntime = new GameRuntimeService(new PrismaGameRepository(prisma), cache, config);

const app = createApp({ config, authService, lobbyService });
const httpServer = createServer(app);
createSocketServer(httpServer, { config, lobbyService, gameRuntime, cache });

httpServer.listen(config.port, () => {
  console.log(`server listening on port ${String(config.port)}`);
});
