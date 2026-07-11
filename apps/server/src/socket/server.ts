import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { AppConfig } from "../config.js";
import type { GameRuntimeService } from "../game/gameRuntime.js";
import type { GameStateCache } from "../game/gameStateCache.js";
import type { LobbyService } from "../lobby/lobbyService.js";
import { createSocketAuthMiddleware } from "./auth.js";
import { registerGameSocketHandlers } from "./gameSocket.js";
import { registerLobbySocketHandlers } from "./lobbySocket.js";
import type { AppServer } from "./types.js";

export interface SocketDependencies {
  readonly config: AppConfig;
  readonly lobbyService: LobbyService;
  readonly gameRuntime: GameRuntimeService;
  readonly cache: GameStateCache;
}

export function createSocketServer(httpServer: HttpServer, deps: SocketDependencies): AppServer {
  const io: AppServer = new Server(httpServer, { cors: { origin: deps.config.corsOrigin } });
  io.use(createSocketAuthMiddleware(deps.config));

  io.on("connection", (socket) => {
    registerLobbySocketHandlers(io, socket, deps.lobbyService, deps.gameRuntime);
    registerGameSocketHandlers(io, socket, deps.gameRuntime, deps.cache);
  });

  return io;
}
