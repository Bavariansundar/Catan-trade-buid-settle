import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { Action, GameView, RedactedGameEvent } from "@hexhaven/engine";
import type { Socket } from "socket.io-client";
import { approxLegalActions } from "../game/approxLegalActions.js";
import { deserializeGameEvents } from "../game/deserializeGameEvents.js";
import { deserializeGameView } from "../game/deserializeGameView.js";
import { GameTable } from "../game/GameTable.js";
import { createGameSocket } from "../socket/socket.js";
import { useAuthStore } from "../store/authStore.js";

interface GameUpdateMessage {
  /** JSON-over-the-wire shape — Map fields arrive as entry arrays and events are already server-redacted; run through `deserializeGameView`/`deserializeGameEvents` before use. */
  readonly view: unknown;
  readonly events: unknown;
  readonly latestSeq: number;
}

export function MultiplayerGameScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const socketRef = useRef<Socket | null>(null);
  const lastSeenSeqRef = useRef<number>(-1);
  const [view, setView] = useState<GameView | null>(null);
  const [latestEvents, setLatestEvents] = useState<readonly RedactedGameEvent[]>([]);
  const [log, setLog] = useState<RedactedGameEvent[]>([]);

  useEffect(() => {
    if (!accessToken || !gameId) return undefined;
    const socket = createGameSocket(accessToken);
    socketRef.current = socket;

    socket.on("game:update", (msg: GameUpdateMessage) => {
      const events = deserializeGameEvents(msg.events);
      setView(deserializeGameView(msg.view));
      setLatestEvents(events);
      setLog((prev) => [...prev, ...events]);
      lastSeenSeqRef.current = msg.latestSeq;
    });
    socket.on("connect", () =>
      socket.emit("game:watch", { gameId, lastSeenSeq: lastSeenSeqRef.current }),
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, gameId]);

  if (!view || !user) return <div className="hh-card">Loading game…</div>;

  function dispatch(action: Action) {
    socketRef.current?.emit(
      "game:action",
      { gameId, action },
      (ack: { ok: boolean; message?: string }) => {
        if (!ack.ok) console.warn("Action rejected:", ack.message);
      },
    );
  }

  const nameFor = (id: string) => (id === user.id ? "You" : `Player ${id.slice(0, 6)}`);

  return (
    <div style={{ padding: "1rem", height: "calc(100vh - 2rem)" }}>
      <GameTable
        view={view}
        viewerId={user.id}
        legalActions={approxLegalActions(view, user.id)}
        latestEvents={latestEvents}
        log={log}
        nameFor={nameFor}
        dispatch={dispatch}
      />
    </div>
  );
}
