import { InMemoryLobbyRepository } from "./lobbyRepository.js";
import { LobbyError, LobbyService } from "./lobbyService.js";

function buildService(): LobbyService {
  return new LobbyService(new InMemoryLobbyRepository());
}

const BASE_OPTIONS = {
  isPublic: true,
  targetVictoryPoints: 10,
  enabledModuleIds: [],
  turnTimerSeconds: 120,
};

describe("LobbyService", () => {
  it("creates a public lobby with the host seated at seat 0", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    expect(lobby.isPublic).toBe(true);
    expect(lobby.code).toBeNull();
    expect(lobby.seats).toEqual([expect.objectContaining({ seatIndex: 0, userId: "host-1" })]);
  });

  it("private lobbies get an invite code, public lobbies don't", async () => {
    const service = buildService();
    const priv = await service.createLobby("host-1", { ...BASE_OPTIONS, isPublic: false });
    expect(priv.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("joins by id and by code, filling the next free seat", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", { ...BASE_OPTIONS, isPublic: false });
    const afterJoin = await service.joinByCode(lobby.code!, "player-2");
    expect(afterJoin.seats.map((s) => s.userId)).toEqual(["host-1", "player-2"]);

    const afterJoin2 = await service.joinById(lobby.id, "player-3");
    expect(afterJoin2.seats.map((s) => s.userId)).toEqual(["host-1", "player-2", "player-3"]);
  });

  it("rejects joining a full lobby (6 seats)", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    for (let i = 2; i <= 6; i++) await service.joinById(lobby.id, `player-${String(i)}`);
    await expect(service.joinById(lobby.id, "player-7")).rejects.toMatchObject({
      code: "LOBBY_FULL",
    });
  });

  it("only the host can add a bot, and not to an occupied seat", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    await expect(service.addBot(lobby.id, "not-the-host", 1, "EASY")).rejects.toMatchObject({
      code: "NOT_HOST",
    });
    const withBot = await service.addBot(lobby.id, "host-1", 1, "EASY");
    expect(withBot.seats).toContainEqual(
      expect.objectContaining({ seatIndex: 1, userId: null, botDifficulty: "EASY" }),
    );
    await expect(service.addBot(lobby.id, "host-1", 1, "HARD")).rejects.toMatchObject({
      code: "SEAT_TAKEN",
    });
  });

  it("cannot start until every human seat is ready and there are >=2 seats", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    await expect(service.start(lobby.id, "host-1")).rejects.toMatchObject({ code: "NOT_READY" });

    await service.joinById(lobby.id, "player-2");
    await service.setReady(lobby.id, "host-1", true);
    await expect(service.start(lobby.id, "host-1")).rejects.toMatchObject({ code: "NOT_READY" });

    await service.setReady(lobby.id, "player-2", true);
    const started = await service.start(lobby.id, "host-1");
    expect(started.status).toBe("STARTED");
  });

  it("a bot seat doesn't need to be ready to start", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    await service.addBot(lobby.id, "host-1", 1, "EASY");
    await service.setReady(lobby.id, "host-1", true);
    const started = await service.start(lobby.id, "host-1");
    expect(started.status).toBe("STARTED");
  });

  it("the host leaving closes the lobby; a non-host leaving frees their seat", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    await service.joinById(lobby.id, "player-2");

    const afterLeave = await service.leave(lobby.id, "player-2");
    expect(afterLeave.seats.map((s) => s.userId)).toEqual(["host-1"]);

    const afterHostLeave = await service.leave(lobby.id, "host-1");
    expect(afterHostLeave.status).toBe("CLOSED");
  });

  it("rejects settings changes and starts on an already-started lobby", async () => {
    const service = buildService();
    const lobby = await service.createLobby("host-1", BASE_OPTIONS);
    await service.addBot(lobby.id, "host-1", 1, "EASY");
    await service.setReady(lobby.id, "host-1", true);
    await service.start(lobby.id, "host-1");
    await expect(
      service.updateSettings(lobby.id, "host-1", { targetVictoryPoints: 12 }),
    ).rejects.toBeInstanceOf(LobbyError);
  });
});
