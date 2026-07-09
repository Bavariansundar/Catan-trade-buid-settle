import cors from "cors";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import type { AuthService } from "./auth/authService.js";
import { createAuthRouter } from "./auth/authRoutes.js";
import { createAuthRateLimiter, createRefreshRateLimiter } from "./auth/rateLimit.js";
import type { AppConfig } from "./config.js";
import { createLobbyRouter } from "./lobby/lobbyRoutes.js";
import type { LobbyService } from "./lobby/lobbyService.js";
import { buildSwaggerSpec } from "./swagger.js";

export interface AppDependencies {
  readonly config: AppConfig;
  readonly authService: AuthService;
  readonly lobbyService: LobbyService;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const authRouter = createAuthRouter(deps.authService, {
    registerAndLogin: createAuthRateLimiter(deps.config),
    refresh: createRefreshRateLimiter(deps.config),
  });
  app.use("/auth", authRouter);
  app.use("/lobbies", createLobbyRouter(deps.lobbyService, deps.config));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));

  return app;
}
