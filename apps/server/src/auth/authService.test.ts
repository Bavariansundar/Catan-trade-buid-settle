import { loadConfig } from "../config.js";
import { AuthError, AuthService } from "./authService.js";
import { InMemoryRefreshTokenRepository } from "./refreshTokenRepository.js";
import { InMemoryUserRepository } from "./userRepository.js";

function buildService(): AuthService {
  const config = loadConfig({
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  });
  return new AuthService(
    new InMemoryUserRepository(),
    new InMemoryRefreshTokenRepository(),
    config,
  );
}

describe("AuthService", () => {
  it("registers a new user and issues tokens", async () => {
    const service = buildService();
    const result = await service.register("a@example.com", "password123", "Alice");
    expect(result.user.email).toBe("a@example.com");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("rejects registering an already-taken email", async () => {
    const service = buildService();
    await service.register("a@example.com", "password123", "Alice");
    await expect(service.register("a@example.com", "different", "Alice2")).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });

  it("logs in with correct credentials and rejects incorrect ones", async () => {
    const service = buildService();
    await service.register("a@example.com", "password123", "Alice");
    const result = await service.login("a@example.com", "password123");
    expect(result.user.email).toBe("a@example.com");
    await expect(service.login("a@example.com", "wrong")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(service.login("nobody@example.com", "password123")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rotates the refresh token on refresh, invalidating the old one", async () => {
    const service = buildService();
    const registered = await service.register("a@example.com", "password123", "Alice");
    const refreshed = await service.refresh(registered.refreshToken);
    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
    expect(refreshed.accessToken).toBeTruthy();

    // The old (now-rotated) refresh token is no longer usable for a fresh refresh...
    await expect(service.refresh(registered.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    // ...and reusing it also revokes the token that replaced it (reuse-detection chain kill).
    await expect(service.refresh(refreshed.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("rejects an unknown refresh token", async () => {
    const service = buildService();
    await expect(service.refresh("not-a-real-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("logout revokes the refresh token", async () => {
    const service = buildService();
    const registered = await service.register("a@example.com", "password123", "Alice");
    await service.logout(registered.refreshToken);
    await expect(service.refresh(registered.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});
