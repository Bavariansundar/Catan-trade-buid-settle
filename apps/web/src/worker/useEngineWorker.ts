import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, GameEvent, GameView, PlayerId } from "@hexhaven/engine";
import type {
  ActionRejectedResponse,
  BotDifficulty,
  EngineWorkerResponse,
  LegalActionsSummary,
} from "./protocol.js";

export interface SinglePlayerConfig {
  readonly playerIds: readonly PlayerId[];
  readonly humanPlayerId: PlayerId;
  readonly seed: string;
  readonly targetVictoryPoints: number;
  readonly botDifficulties: Record<PlayerId, BotDifficulty>;
  /** When resuming a saved game, the full action log to replay before play continues. */
  readonly resumeActions?: readonly Action[];
}

export interface EngineWorkerState {
  readonly view: GameView | null;
  readonly events: readonly GameEvent[];
  readonly legalActions: LegalActionsSummary | null;
  readonly gameOver: boolean;
  readonly lastRejection: ActionRejectedResponse | null;
  readonly dispatch: (action: Action) => void;
}

/**
 * Runs the engine + bots for single-player mode in a dedicated Web Worker.
 * `onActionsApplied` fires with every action (human + bot) as it's applied,
 * in order — the caller uses this to persist a resumable save (see
 * persistence/db.ts) without the worker needing to know about IndexedDB.
 */
export function useEngineWorker(
  config: SinglePlayerConfig | null,
  onActionsApplied?: (actions: readonly Action[]) => void,
): EngineWorkerState {
  const workerRef = useRef<Worker | null>(null);
  const onActionsAppliedRef = useRef(onActionsApplied);
  onActionsAppliedRef.current = onActionsApplied;
  const [view, setView] = useState<GameView | null>(null);
  const [events, setEvents] = useState<readonly GameEvent[]>([]);
  const [legalActions, setLegalActions] = useState<LegalActionsSummary | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [lastRejection, setLastRejection] = useState<ActionRejectedResponse | null>(null);

  useEffect(() => {
    if (!config) return undefined;
    const worker = new Worker(new URL("./engineWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<EngineWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "update") {
        setView(msg.view);
        setEvents(msg.events);
        setLegalActions(msg.legalActions);
        setGameOver(msg.gameOver);
        setLastRejection(null);
        if (msg.newlyAppliedActions.length > 0)
          onActionsAppliedRef.current?.(msg.newlyAppliedActions);
      } else {
        setLastRejection(msg);
      }
    };

    worker.postMessage({
      type: "init",
      playerIds: config.playerIds,
      humanPlayerId: config.humanPlayerId,
      seed: config.seed,
      targetVictoryPoints: config.targetVictoryPoints,
      botDifficulties: config.botDifficulties,
      resumeActions: config.resumeActions,
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // config is treated as immutable for the lifetime of a single-player session
  }, [config?.seed]);

  const dispatch = useCallback((action: Action) => {
    workerRef.current?.postMessage({ type: "action", action });
  }, []);

  return { view, events, legalActions, gameOver, lastRejection, dispatch };
}
