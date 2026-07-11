import { GameRuntimeService } from "../game/gameRuntime.js";
import { LobbyError, LobbyService } from "../lobby/lobbyService.js";
import type { LobbySettingsUpdate } from "../lobby/lobbyRepository.js";
import type { LobbyRecord } from "../domain/types.js";
import { createEventRateLimiter } from "./rateLimiter.js";
import {
  lobbyAddBotSchema,
  lobbyChatSchema,
  lobbyLeaveSchema,
  lobbyRemoveSeatSchema,
  lobbySetReadySchema,
  lobbyStartSchema,
  lobbyUpdateSettingsSchema,
  lobbyWatchSchema,
} from "./schemas.js";
import type { AppServer, AppSocket } from "./types.js";

/** Whether `userId` may see `lobby`'s state — public lobbies are open to anyone, private ones only to seated players (the host is always seated at seat 0). */
export function canWatch(lobby: LobbyRecord, userId: string): boolean {
  return lobby.isPublic || lobby.seats.some((s) => s.userId === userId);
}

/** No legitimate human sends chat messages this fast — unlike `game:action`, chat has no natural pacing to lean on. */
const isChatAllowed = createEventRateLimiter({ windowMs: 5000, maxEventsPerWindow: 10 });

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

  socket.on("lobby:watch", async (rawPayload: unknown) => {
    const parsed = lobbyWatchSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const lobby = await lobbyService.getLobby(parsed.data.lobbyId).catch(() => null);
    if (!lobby || !canWatch(lobby, userId)) return;
    await socket.join(lobbyRoom(parsed.data.lobbyId));
    socket.emit("lobby:state", lobby);
  });

  socket.on("lobby:leave", async (rawPayload: unknown) => {
    const parsed = lobbyLeaveSchema.safeParse(rawPayload);
    if (!parsed.success) return;
    const { lobbyId } = parsed.data;
    await lobbyService.leave(lobbyId, userId);
    await socket.leave(lobbyRoom(lobbyId));
    await broadcastLobby(io, lobbyService, lobbyId);
  });

  socket.on("lobby:setReady", async (rawPayload: unknown) => {
    const parsed = lobbySetReadySchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const { lobbyId, isReady } = parsed.data;
    await lobbyService.setReady(lobbyId, userId, isReady);
    await broadcastLobby(io, lobbyService, lobbyId);
  });

  socket.on("lobby:addBot", async (rawPayload: unknown) => {
    const parsed = lobbyAddBotSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const { lobbyId, seatIndex, difficulty } = parsed.data;
    try {
      await lobbyService.addBot(lobbyId, userId, seatIndex, difficulty);
      await broadcastLobby(io, lobbyService, lobbyId);
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });

  socket.on("lobby:removeSeat", async (rawPayload: unknown) => {
    const parsed = lobbyRemoveSeatSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const { lobbyId, seatIndex } = parsed.data;
    try {
      await lobbyService.removeSeat(lobbyId, userId, seatIndex);
      await broadcastLobby(io, lobbyService, lobbyId);
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });

  socket.on("lobby:updateSettings", async (rawPayload: unknown) => {
    const parsed = lobbyUpdateSettingsSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const { lobbyId, targetVictoryPoints, enabledModuleIds, turnTimerSeconds } = parsed.data;
    const updates: LobbySettingsUpdate = {
      ...(targetVictoryPoints !== undefined ? { targetVictoryPoints } : {}),
      ...(enabledModuleIds !== undefined ? { enabledModuleIds } : {}),
      ...(turnTimerSeconds !== undefined ? { turnTimerSeconds } : {}),
    };
    try {
      await lobbyService.updateSettings(lobbyId, userId, updates);
      await broadcastLobby(io, lobbyService, lobbyId);
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });

  socket.on("lobby:chat", (rawPayload: unknown) => {
    if (!isChatAllowed(socket.id)) return;
    const parsed = lobbyChatSchema.safeParse(rawPayload);
    if (!parsed.success) return;
    const { lobbyId, message } = parsed.data;
    const trimmed = message.trim().slice(0, 500);
    if (!trimmed) return;
    io.to(lobbyRoom(lobbyId)).emit("lobby:chat", {
      userId,
      displayName: socket.data.displayName,
      message: trimmed,
      at: new Date().toISOString(),
    });
  });

  socket.on("lobby:start", async (rawPayload: unknown) => {
    const parsed = lobbyStartSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit("lobby:error", { code: "INVALID_PAYLOAD" });
      return;
    }
    const { lobbyId } = parsed.data;
    try {
      const lobby = await lobbyService.start(lobbyId, userId);
      const { gameId } = await gameRuntime.startGame(lobby);
      io.to(lobbyRoom(lobbyId)).emit("lobby:gameStarted", { gameId });
    } catch (error) {
      if (error instanceof LobbyError) socket.emit("lobby:error", { code: error.code });
      else throw error;
    }
  });
}
