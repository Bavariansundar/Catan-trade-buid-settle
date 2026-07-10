import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api/client.js";

export function createGameSocket(accessToken: string): Socket {
  return io(API_URL, { auth: { token: accessToken }, autoConnect: true });
}
