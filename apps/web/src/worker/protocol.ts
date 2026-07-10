import type {
  Action,
  DevCardType,
  Edge,
  GameEvent,
  GameView,
  Hex,
  PlayerId,
  ResourceType,
  Vertex,
} from "@hexhaven/engine";

export type BotDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface LegalActionsSummary {
  readonly settlementVertexIds: string[];
  readonly cityVertexIds: string[];
  readonly roadEdgeIds: string[];
  readonly robberCandidates: { hex: Hex; stealFromPlayerId: PlayerId | null }[];
  readonly maritimeTrades: { give: ResourceType; get: ResourceType }[];
  readonly canBuyDevCard: boolean;
  readonly playableDevCardTypes: Exclude<DevCardType, "victory_point">[];
}

export interface InitRequest {
  readonly type: "init";
  readonly playerIds: readonly PlayerId[];
  readonly humanPlayerId: PlayerId;
  readonly seed: string;
  readonly targetVictoryPoints: number;
  readonly botDifficulties: Record<PlayerId, BotDifficulty>;
  /** Replayed against a fresh `createGame` before play resumes — see persistence/db.ts. */
  readonly resumeActions?: readonly Action[];
}

export interface ActionRequest {
  readonly type: "action";
  readonly action: Action;
}

export type EngineWorkerRequest = InitRequest | ActionRequest;

export interface UpdateResponse {
  readonly type: "update";
  readonly view: GameView;
  readonly events: readonly GameEvent[];
  readonly legalActions: LegalActionsSummary;
  readonly gameOver: boolean;
  /** Every action applied (human + bot) since the previous update — accumulated client-side for save/resume. */
  readonly newlyAppliedActions: readonly Action[];
}

export interface ActionRejectedResponse {
  readonly type: "actionRejected";
  readonly code: string;
  readonly message: string;
}

export type EngineWorkerResponse = UpdateResponse | ActionRejectedResponse;

// re-exported for convenience at call sites that only need the shape, not the logic
export type { Vertex, Edge };
