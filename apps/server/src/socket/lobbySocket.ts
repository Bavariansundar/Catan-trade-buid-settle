import { GameRuntimeService } from "../game/gameRuntime.js";
import { LobbyError, LobbyService } from "../lobby/lobbyService.js";
import type { BotDifficulty } from "../domain/types.js";
import type { AppServer, AppSocket } from "./types.js";

function lobbyRoom(lobbyId: string): string {
  return `lobby:${lobbyId}`;
}

async function broadcastLobby(
  io: AppServer,
  lobbyService: LobbyService,
  lobbyId: string,
): Promise<void> {
  try {
    const lobby = await lobbyService.getLobby(lobbyId);
    io.to(lobbyRoom(lobbyId)).emit("lobby:state", lobby);
  } catch {
    // Lobby no longer exists (e.g. host closed it) — nothing to broadcast.
  }
}

/** Lobby sync — see docs/architecture/server.md §3. */
export function registerLobbySocketHandlers(
  io: AppServer,
  socket: AppSocket,
  lobbyService: LobbyService,
  gameRuntime: GameRuntimeService,
): void {
  const userId = socket.data.userId;

  socket.on("lobby:watch", async (payload: { lobbyId: string }) => {
    await socket.join(lobbyRoom(payload.lobbyId));
    const lobby = await lobbyService.getLobby(payload.lobbyId).catch(() => null);
    if (lobby) socket.emit("lobby:state", lobby);
  });

  socket.on("lobby:leave", async (payload: { lobbyId: string }) => {
    await lobbyService.leave(payload.lobbyId, userId);
    await socket.leave(lobbyRoom(payload.lobbyId));
    await broadcastLobby(io, lobbyService, payload.lobbyId);
  });

  socket.on("lobby:setReady", async (payload: { lobbyId: string; isReady: boolean }) => {
    await lobbyService.setReady(payload.lobbyId, userId, payload.isReady);
    await broadcastLobby(io, lobbyService, payload.lobbyId);
  });

  socket.on(
    "lobby:addBot",
    async (payload: { lobbyId: string; seatIndex: number; difficulty: BotDifficulty }) => {
      try {
        await lobbyService.addBot(payload.lobbyId, userId, payload.seatIndex, payload.difficulty);
        await broadcastLobby(io, lobbyService, payload.lobbyId);
      } catch (error) {
        if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
        else throw error;
      }
    },
  );

  socket.on("lobby:removeSeat", async (payload: { lobbyId: string; seatIndex: number }) => {
    try {
      await lobbyService.removeSeat(payload.lobbyId, userId, payload.seatIndex);
      await broadcastLobby(io, lobbyService, payload.lobbyId);
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });

  socket.on(
    "lobby:updateSettings",
    async (payload: {
      lobbyId: string;
      targetVictoryPoints?: number;
      enabledModuleIds?: string[];
      turnTimerSeconds?: number;
    }) => {
      const { lobbyId, ...updates } = payload;
      try {
        await lobbyService.updateSettings(lobbyId, userId, updates);
        await broadcastLobby(io, lobbyService, lobbyId);
      } catch (error) {
        if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
        else throw error;
      }
    },
  );

  socket.on("lobby:chat", (payload: { lobbyId: string; message: string }) => {
    const trimmed = payload.message.trim().slice(0, 500);
    if (!trimmed) return;
    io.to(lobbyRoom(payload.lobbyId)).emit("lobby:chat", {
      userId,
      displayName: socket.data.displayName,
      message: trimmed,
      at: new Date().toISOString(),
    });
  });

  socket.on("lobby:start", async (payload: { lobbyId: string }) => {
    try {
      const lobby = await lobbyService.start(payload.lobbyId, userId);
      const { gameId } = await gameRuntime.startGame(lobby);
      io.to(lobbyRoom(payload.lobbyId)).emit("lobby:gameStarted", { gameId });
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });
}
