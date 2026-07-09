import type { DefaultEventsMap, Server as IOServer, Socket as IOSocket } from "socket.io";

export interface SocketData {
  userId: string;
  displayName: string;
  /** gameIds this socket is watching as a *player* (not a spectator) — used to fire onDisconnect for each on disconnect. */
  watchedPlayerGames: Set<string>;
}

export type AppServer = IOServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type AppSocket = IOSocket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
