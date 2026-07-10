import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import type { BotDifficulty, Lobby } from "../api/lobby.js";
import { createGameSocket } from "../socket/socket.js";
import { useAuthStore } from "../store/authStore.js";

interface ChatMessage {
  readonly userId: string;
  readonly displayName: string;
  readonly message: string;
  readonly at: string;
}

export function LobbyRoomScreen() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !lobbyId) return undefined;
    const socket = createGameSocket(accessToken);
    socketRef.current = socket;

    socket.on("lobby:state", (state: Lobby) => setLobby(state));
    socket.on("lobby:chat", (msg: ChatMessage) => setChat((prev) => [...prev, msg]));
    socket.on("lobby:error", (err: { code: string }) => setError(err.code));
    socket.on("lobby:gameStarted", (payload: { gameId: string }) =>
      navigate(`/game/${payload.gameId}`),
    );
    socket.on("connect", () => socket.emit("lobby:watch", { lobbyId }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, lobbyId, navigate]);

  if (!lobby || !user) return <div className="hh-card">Loading lobby…</div>;

  const mySeat = lobby.seats.find((s) => s.userId === user.id);
  const isHost = lobby.hostUserId === user.id;

  function labelFor(seatUserId: string | null): string {
    if (!seatUserId) return "Empty";
    if (seatUserId === user!.id) return "You";
    return `Player ${seatUserId.slice(0, 6)}`;
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "2rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <h2>Lobby {lobby.code ?? lobby.id.slice(0, 8)}</h2>
      {error && <div style={{ color: "var(--hh-danger)" }}>{error}</div>}

      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {Array.from({ length: 6 }, (_, seatIndex) =>
          lobby.seats.find((s) => s.seatIndex === seatIndex),
        ).map((seat, seatIndex) => (
          <div
            key={seatIndex}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>
              Seat {seatIndex}:{" "}
              {seat
                ? seat.botDifficulty
                  ? `Bot (${seat.botDifficulty})`
                  : labelFor(seat.userId)
                : "Empty"}
              {seat?.isReady && " ✓"}
            </span>
            {isHost && !seat && (
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {(["EASY", "MEDIUM", "HARD"] as BotDifficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="hh-button hh-button--secondary"
                    onClick={() =>
                      socketRef.current?.emit("lobby:addBot", { lobbyId, seatIndex, difficulty: d })
                    }
                  >
                    + {d} bot
                  </button>
                ))}
              </div>
            )}
            {isHost && seat?.botDifficulty && (
              <button
                type="button"
                className="hh-button hh-button--secondary"
                onClick={() => socketRef.current?.emit("lobby:removeSeat", { lobbyId, seatIndex })}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="hh-button"
          onClick={() =>
            socketRef.current?.emit("lobby:setReady", { lobbyId, isReady: !mySeat?.isReady })
          }
        >
          {mySeat?.isReady ? "Not Ready" : "Ready"}
        </button>
        {isHost && (
          <button
            type="button"
            className="hh-button hh-button--secondary"
            onClick={() => socketRef.current?.emit("lobby:start", { lobbyId })}
          >
            Start Game
          </button>
        )}
      </div>

      <div className="hh-card" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <h3 style={{ fontSize: "1rem" }}>Chat</h3>
        <div
          style={{
            maxHeight: 160,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
          }}
        >
          {chat.map((m, i) => (
            <div key={i} style={{ fontSize: "0.85rem" }}>
              <strong>{m.displayName}:</strong> {m.message}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!chatInput.trim()) return;
            socketRef.current?.emit("lobby:chat", { lobbyId, message: chatInput });
            setChatInput("");
          }}
          style={{ display: "flex", gap: "0.4rem" }}
        >
          <input
            className="hh-input"
            style={{ flex: 1 }}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className="hh-button hh-button--secondary">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
