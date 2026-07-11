import cors from "cors";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import type { AuthService } from "./auth/authService.js";
import { createAuthRouter } from "./auth/authRoutes.js";
import { createAuthRateLimiter, createRefreshRateLimiter } from "./auth/rateLimit.js";
import type { AppConfig } from "./config.js";
import { createLobbyRouter } from "./lobby/lobbyRoutes.js";
import type { LobbyService } from "./lobby/lobbyService.js";
import { createHistoryRouter } from "./stats/historyRoutes.js";
import type { HistoryService } from "./stats/historyService.js";
import { createProfileRouter } from "./stats/profileRoutes.js";
import type { ProfileService } from "./stats/profileService.js";
import { buildSwaggerSpec } from "./swagger.js";

export interface AppDependencies {
  readonly config: AppConfig;
  readonly authService: AuthService;
  readonly lobbyService: LobbyService;
  readonly historyService: HistoryService;
  readonly profileService: ProfileService;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors({ origin: deps.config.corsOrigin }));
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
  app.use("/history", createHistoryRouter(deps.historyService, deps.config));
  app.use("/profile", createProfileRouter(deps.profileService, deps.config));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));

  return app;
}
