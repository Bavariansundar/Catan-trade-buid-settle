import request from "supertest";
import { createApp } from "./app.js";
import { AuthService } from "./auth/authService.js";
import { InMemoryRefreshTokenRepository } from "./auth/refreshTokenRepository.js";
import { InMemoryUserRepository } from "./auth/userRepository.js";
import { loadConfig } from "./config.js";
import { InMemoryGameRepository } from "./game/gameRepository.js";
import { InMemoryLobbyRepository } from "./lobby/lobbyRepository.js";
import { LobbyService } from "./lobby/lobbyService.js";
import { InMemoryAchievementRepository } from "./stats/achievementRepository.js";
import { HistoryService } from "./stats/historyService.js";
import { InMemoryPlayerStatsRepository } from "./stats/playerStatsRepository.js";
import { ProfileService } from "./stats/profileService.js";

function buildTestApp() {
  const config = loadConfig({
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  });
  const authService = new AuthService(
    new InMemoryUserRepository(),
    new InMemoryRefreshTokenRepository(),
    config,
  );
  const lobbyService = new LobbyService(new InMemoryLobbyRepository());
  const historyService = new HistoryService(new InMemoryGameRepository());
  const profileService = new ProfileService(
    new InMemoryPlayerStatsRepository(),
    new InMemoryAchievementRepository(),
  );
  return createApp({ config, authService, lobbyService, historyService, profileService });
}

describe("server scaffold", () => {
  it("responds to health check", async () => {
    const response = await request(buildTestApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("serves swagger docs", async () => {
    const response = await request(buildTestApp()).get("/docs/");
    expect(response.status).toBe(200);
  });
});
