import request from "supertest";
import { createApp } from "./app.js";
import { AuthService } from "./auth/authService.js";
import { InMemoryRefreshTokenRepository } from "./auth/refreshTokenRepository.js";
import { InMemoryUserRepository } from "./auth/userRepository.js";
import { loadConfig } from "./config.js";
import { InMemoryLobbyRepository } from "./lobby/lobbyRepository.js";
import { LobbyService } from "./lobby/lobbyService.js";

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
  return createApp({ config, authService, lobbyService });
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
