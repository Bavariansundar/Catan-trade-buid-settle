import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { RuleBasedBot, resolveActingPlayerId } from "@hexhaven/bots";
import type { GameEvent } from "@hexhaven/engine";
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

interface ActionAck {
  ok: boolean;
  code?: string;
  message?: string;
}

interface AuthResponseBody {
  accessToken: string;
  user: { id: string };
}

function emitAction(socket: ClientSocket, gameId: string, action: unknown): Promise<ActionAck> {
  return new Promise((resolve) => {
    socket.emit("game:action", { gameId, action }, resolve);
  });
}

describe("full multiplayer game over Socket.IO, including a mid-game reconnect", () => {
  it("plays a 2-player game from lobby creation to a decided winner, with a reconnect in the middle", async () => {
    const config = loadConfig({
      JWT_ACCESS_SECRET: "integration-access-secret",
      JWT_REFRESH_SECRET: "integration-refresh-secret",
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
      // --- Register two players and log in over REST ---
      const alice = await request(app)
        .post("/auth/register")
        .send({ email: "alice@example.com", password: "password123", displayName: "Alice" });
      const bob = await request(app)
        .post("/auth/register")
        .send({ email: "bob@example.com", password: "password123", displayName: "Bob" });
      expect(alice.status).toBe(200);
      expect(bob.status).toBe(200);
      const aliceAuth = alice.body as AuthResponseBody;
      const bobAuth = bob.body as AuthResponseBody;
      const aliceToken = aliceAuth.accessToken;
      const bobToken = bobAuth.accessToken;
      const aliceId = aliceAuth.user.id;
      const bobId = bobAuth.user.id;

      // --- Alice creates a public lobby, Bob joins it over REST ---
      const createRes = await request(app)
        .post("/lobbies")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          isPublic: true,
          targetVictoryPoints: 10,
          enabledModuleIds: [],
          turnTimerSeconds: 120,
        });
      expect(createRes.status).toBe(200);
      const lobbyId = (createRes.body as { id: string }).id;

      const joinRes = await request(app)
        .post(`/lobbies/${lobbyId}/join`)
        .set("Authorization", `Bearer ${bobToken}`);
      expect(joinRes.status).toBe(200);

      // --- Both connect over Socket.IO, ready up, and Alice (host) starts the game ---
      const aliceSocket = ioClient(baseUrl, { auth: { token: aliceToken } });
      const bobSocket = ioClient(baseUrl, { auth: { token: bobToken } });
      await Promise.all([waitFor(aliceSocket, "connect"), waitFor(bobSocket, "connect")]);

      aliceSocket.emit("lobby:watch", { lobbyId });
      bobSocket.emit("lobby:watch", { lobbyId });

      // `lobby:setReady` from two *different* sockets has no cross-socket
      // ordering guarantee — wait for a broadcast confirming both seats
      // are actually ready server-side before starting, rather than
      // racing `lobby:start` against Bob's still-in-flight setReady.
      const bothReadyPromise = new Promise<void>((resolve) => {
        aliceSocket.on(
          "lobby:state",
          (lobby: { seats: { userId: string | null; isReady: boolean }[] }) => {
            if (lobby.seats.filter((s) => s.userId).every((s) => s.isReady)) resolve();
          },
        );
      });
      aliceSocket.emit("lobby:setReady", { lobbyId, isReady: true });
      bobSocket.emit("lobby:setReady", { lobbyId, isReady: true });
      await bothReadyPromise;

      const startedPromise = waitFor<{ gameId: string }>(aliceSocket, "lobby:gameStarted");
      aliceSocket.emit("lobby:start", { lobbyId });
      const { gameId } = await startedPromise;
      expect(gameId).toBeTruthy();

      // --- Both watch the game ---
      const aliceUpdates: {
        view: { phase: { name: string } };
        events: GameEvent[];
        latestSeq: number;
      }[] = [];
      const bobUpdates: typeof aliceUpdates = [];
      aliceSocket.on("game:update", (msg: (typeof aliceUpdates)[number]) => aliceUpdates.push(msg));
      bobSocket.on("game:update", (msg: (typeof bobUpdates)[number]) => bobUpdates.push(msg));
      aliceSocket.emit("game:watch", { gameId });
      bobSocket.emit("game:watch", { gameId });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const socketByPlayerId: Record<string, ClientSocket> = {
        [aliceId]: aliceSocket,
        [bobId]: bobSocket,
      };
      let bobDisconnectedOnce = false;
      let sawReconnectReplay = false;

      // --- Drive the game to completion, using RuleBasedBot to decide each move ---
      // (the test has a direct reference to gameRuntime purely to *decide* what
      // to send next — every actual state mutation still goes through the real
      // socket -> GameRuntimeService.submitAction path under test.)
      for (let i = 0; i < 3000; i++) {
        const loaded = await gameRuntime.loadGame(gameId);
        if (loaded.state.phase.name === "ended") break;
        const actingPlayerId = resolveActingPlayerId(loaded.state);
        const action = bot.chooseAction(loaded.state, actingPlayerId, loaded.modules);

        // --- Mid-game: disconnect Bob, let Alice act once more, then reconnect Bob with a replay ---
        if (
          !bobDisconnectedOnce &&
          loaded.state.phase.name === "main" &&
          actingPlayerId === aliceId
        ) {
          bobDisconnectedOnce = true;
          const bobLastSeenSeq = bobUpdates.at(-1)?.latestSeq ?? -1;
          bobSocket.disconnect();

          const ack = await emitAction(socketByPlayerId[actingPlayerId]!, gameId, action);
          expect(ack.ok).toBe(true);

          const reconnectedBob = ioClient(baseUrl, { auth: { token: bobToken } });
          await waitFor(reconnectedBob, "connect");
          const replayPromise = waitFor<(typeof bobUpdates)[number]>(reconnectedBob, "game:update");
          reconnectedBob.emit("game:watch", { gameId, lastSeenSeq: bobLastSeenSeq });
          const replayMessage = await replayPromise;
          expect(replayMessage.events.length).toBeGreaterThan(0); // Alice's action(s) while Bob was away
          sawReconnectReplay = true;

          socketByPlayerId[bobId] = reconnectedBob;
          reconnectedBob.on("game:update", (msg: (typeof bobUpdates)[number]) =>
            bobUpdates.push(msg),
          );
          continue;
        }

        const ack = await emitAction(socketByPlayerId[actingPlayerId]!, gameId, action);
        expect(ack.ok).toBe(true);
      }

      expect(sawReconnectReplay).toBe(true);
      const finalState = (await gameRuntime.loadGame(gameId)).state;
      expect(finalState.phase.name).toBe("ended");
      const winnerId = finalState.phase.name === "ended" ? finalState.phase.winner : null;
      const winnerToken = winnerId === aliceId ? aliceToken : bobToken;

      // --- Match history + profile should reflect the just-finished game ---
      const historyRes = await request(app)
        .get("/history")
        .set("Authorization", `Bearer ${winnerToken}`);
      expect(historyRes.status).toBe(200);
      const historyBody = historyRes.body as { items: { id: string; status: string }[] };
      expect(historyBody.items.some((g) => g.id === gameId && g.status === "ENDED")).toBe(true);

      const detailRes = await request(app)
        .get(`/history/${gameId}`)
        .set("Authorization", `Bearer ${winnerToken}`);
      expect(detailRes.status).toBe(200);
      const detailBody = detailRes.body as { stats: { winnerId: string } };
      expect(detailBody.stats.winnerId).toBe(winnerId);

      const profileRes = await request(app)
        .get("/profile")
        .set("Authorization", `Bearer ${winnerToken}`);
      expect(profileRes.status).toBe(200);
      const profileBody = profileRes.body as {
        stats: { gamesPlayed: number; gamesWon: number };
        achievements: { achievementId: string }[];
      };
      expect(profileBody.stats.gamesPlayed).toBe(1);
      expect(profileBody.stats.gamesWon).toBe(1);
      expect(profileBody.achievements.some((a) => a.achievementId === "first_win")).toBe(true);

      aliceSocket.disconnect();
      bobSocket.disconnect();
      socketByPlayerId[bobId]!.disconnect();
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 60_000);
});
