import type { AppConfig } from "../config.js";
import { verifyAccessToken } from "../auth/tokens.js";
import type { AppSocket } from "./types.js";

/**
 * Verifies the JWT access token passed in the Socket.IO handshake `auth`
 * payload *before* the connection is accepted — see
 * docs/architecture/server.md §3. `socket.data.userId` is the only trusted
 * notion of "who is this" from here on; no event handler should ever take a
 * user id from the event payload itself.
 */
export function createSocketAuthMiddleware(config: AppConfig) {
  return (socket: AppSocket, next: (err?: Error) => void): void => {
    const token = socket.handshake.auth["token"] as unknown;
    if (typeof token !== "string" || !token) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      const payload = verifyAccessToken(token, config.jwtAccessSecret);
      socket.data = {
        userId: payload.sub,
        displayName: payload.displayName,
        watchedPlayerGames: new Set(),
      };
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  };
}
