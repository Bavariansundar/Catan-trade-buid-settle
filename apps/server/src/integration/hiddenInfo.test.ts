import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { RuleBasedBot, resolveActingPlayerId } from "@hexhaven/bots";
import { createApp } from "../app.js";
import { AuthService } from "../auth/authService.js";
import { InMemoryRefreshTokenRepository } from "../auth/refreshTokenRepository.js";
import { InMemoryUserRepository } from "../auth/userRepository.js";
import { loadConfig } from "../config.js";
import { InMemoryGameRepository } from "../game/gameRepository.js";
import { GameRuntimeService } from "../game/gameRuntime.js";
import { InMemoryGameStateCache } from "../game/gameStateCache.js";
import { InMemoryLobbyRepository } from "../lobby/lobbyRepository.js";
import { LobbyService } from "../lobby/lobbyService.js";
import { createSocketServer } from "../socket/server.js";
import { InMemoryAchievementRepository } from "../stats/achievementRepository.js";
import { HistoryService } from "../stats/historyService.js";
import { MatchRecorder } from "../stats/matchRecorder.js";
import { InMemoryPlayerStatsRepository } from "../stats/playerStatsRepository.js";
import { ProfileService } from "../stats/profileService.js";

const bot = new RuleBasedBot();

function waitFor<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (arg: T) => void));
}

interface AuthResponseBody {
  accessToken: string;
  user: { id: string };
}

interface WirePlayer {
  readonly id: string;
  readonly hand: unknown;
  readonly devCards: unknown;
  readonly handCount: number;
  readonly devCardCount: number;
}

interface WireGameEvent {
  readonly type: string;
  readonly playerId?: string;
  readonly thiefId?: string;
  readonly victimId?: string;
  readonly resources?: unknown;
  readonly resource?: unknown;
  readonly card?: unknown;
}

interface WireGameUpdate {
  readonly view: { readonly players: readonly WirePlayer[] };
  readonly events: readonly WireGameEvent[];
}

/** The four event types that carry a field only certain players are entitled to see — see packages/engine's redactEventsFor. */
const SENSITIVE_EVENT_TYPES = new Set([
  "DISCARDED",
  "RESOURCE_STOLEN",
  "DEV_CARD_BOUGHT",
  "PROGRESS_CARD_DRAWN",
]);

function entitledPlayerIds(event: WireGameEvent): readonly string[] {
  if (event.type === "RESOURCE_STOLEN") {
    return [event.thiefId, event.victimId].filter((id): id is string => id !== undefined);
  }
  return event.playerId !== undefined ? [event.playerId] : [];
}

/**
 * Phase 11's security review requires proving no opponent hand/dev-card
 * content ever crosses the wire — this asserts it directly on the exact
 * serialized payload a real client receives (`game:update`'s `view`), for
 * both players and a non-participant spectator, across a full 3-player game
 * (chosen over 2 specifically to make discards/steals/trades more likely).
 */
describe("hidden information never leaks over game:update", () => {
  it("redacts every other player's hand and dev cards for every viewer, including spectators", async () => {
    const config = loadConfig({
      JWT_ACCESS_SECRET: "hidden-info-access-secret",
      JWT_REFRESH_SECRET: "hidden-info-refresh-secret",
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

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${String(port)}`;

    try {
      const players = await Promise.all(
        ["alice", "bob", "carol"].map((name) =>
          request(app)
            .post("/auth/register")
            .send({ email: `${name}@example.com`, password: "password123", displayName: name }),
        ),
      );
      const [aliceAuth, bobAuth, carolAuth] = players.map((r) => r.body as AuthResponseBody);
      const tokens = [aliceAuth!.accessToken, bobAuth!.accessToken, carolAuth!.accessToken];
      const playerIds = [aliceAuth!.user.id, bobAuth!.user.id, carolAuth!.user.id];

      const createRes = await request(app)
        .post("/lobbies")
        .set("Authorization", `Bearer ${tokens[0]}`)
        .send({
          isPublic: true,
          targetVictoryPoints: 10,
          enabledModuleIds: [],
          turnTimerSeconds: 120,
        });
      const lobbyId = (createRes.body as { id: string }).id;
      for (const token of tokens.slice(1)) {
        await request(app).post(`/lobbies/${lobbyId}/join`).set("Authorization", `Bearer ${token}`);
      }

      const sockets = tokens.map((token) => ioClient(baseUrl, { auth: { token } }));
      const [aliceSocket, bobSocket, carolSocket] = sockets;
      await Promise.all(sockets.map((s) => waitFor(s, "connect")));
      for (const s of sockets) s.emit("lobby:watch", { lobbyId });

      const allReadyPromise = new Promise<void>((resolve) => {
        aliceSocket!.on(
          "lobby:state",
          (lobby: { seats: { userId: string | null; isReady: boolean }[] }) => {
            if (lobby.seats.filter((s) => s.userId).every((s) => s.isReady)) resolve();
          },
        );
      });
      for (const s of sockets) s.emit("lobby:setReady", { lobbyId, isReady: true });
      await allReadyPromise;

      const startedPromise = waitFor<{ gameId: string }>(aliceSocket!, "lobby:gameStarted");
      aliceSocket!.emit("lobby:start", { lobbyId });
      const { gameId } = await startedPromise;

      // A stranger with no seat in this game — the redacted spectator view.
      const spectatorRegisterRes = await request(app).post("/auth/register").send({
        email: "spectator@example.com",
        password: "password123",
        displayName: "Spectator",
      });
      const spectatorToken = (spectatorRegisterRes.body as AuthResponseBody).accessToken;
      const spectatorSocket = ioClient(baseUrl, { auth: { token: spectatorToken } });
      await waitFor(spectatorSocket, "connect");

      const updatesBySocket = new Map<ClientSocket, WireGameUpdate[]>();
      for (const s of [...sockets, spectatorSocket]) {
        const updates: WireGameUpdate[] = [];
        updatesBySocket.set(s, updates);
        s.on("game:update", (msg: WireGameUpdate) => updates.push(msg));
        s.emit("game:watch", { gameId });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      const socketByPlayerId: Record<string, ClientSocket> = {
        [playerIds[0]!]: aliceSocket!,
        [playerIds[1]!]: bobSocket!,
        [playerIds[2]!]: carolSocket!,
      };

      for (let i = 0; i < 3000; i++) {
        const loaded = await gameRuntime.loadGame(gameId);
        if (loaded.state.phase.name === "ended") break;
        const actingPlayerId = resolveActingPlayerId(loaded.state);
        const action = bot.chooseAction(loaded.state, actingPlayerId, loaded.modules);
        await new Promise<void>((resolve) => {
          socketByPlayerId[actingPlayerId]!.emit("game:action", { gameId, action }, () =>
            resolve(),
          );
        });
      }
      expect((await gameRuntime.loadGame(gameId)).state.phase.name).toBe("ended");

      // Every update captured for every socket, across the whole game, must never
      // reveal another player's hand/dev cards — checked on the literal wire payload.
      let checkedAtLeastOnePayload = false;
      let checkedAtLeastOneSensitiveEvent = false;
      for (const [socket, updates] of updatesBySocket) {
        expect(updates.length).toBeGreaterThan(0);
        const viewerPlayerId = playerIds.find((id) => socketByPlayerId[id] === socket) ?? null;
        for (const update of updates) {
          for (const player of update.view.players) {
            checkedAtLeastOnePayload = true;
            if (player.id === viewerPlayerId) continue; // viewer's own hand is legitimately visible
            expect(player.hand).toBeNull();
            expect(player.devCards).toBeNull();
            expect(typeof player.handCount).toBe("number");
            expect(typeof player.devCardCount).toBe("number");
          }

          // Same check for the event log alongside the view: DISCARDED.resources,
          // RESOURCE_STOLEN.resource, DEV_CARD_BOUGHT.card, and PROGRESS_CARD_DRAWN.card
          // must be absent unless this viewer is one of the entitled players.
          for (const event of update.events) {
            if (!SENSITIVE_EVENT_TYPES.has(event.type)) continue;
            checkedAtLeastOneSensitiveEvent = true;
            const entitled = entitledPlayerIds(event).includes(viewerPlayerId ?? "");
            if (entitled) continue;
            expect(event).not.toHaveProperty("resources");
            expect(event).not.toHaveProperty("resource");
            expect(event).not.toHaveProperty("card");
          }
        }
      }
      expect(checkedAtLeastOnePayload).toBe(true);
      expect(checkedAtLeastOneSensitiveEvent).toBe(true);

      for (const s of [...sockets, spectatorSocket]) s.disconnect();
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 60_000);
});
