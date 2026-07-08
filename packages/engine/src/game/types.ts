import type { Edge, Hex, Vertex } from "../coordinates.js";
import type { Board, PlayerId, ResourceType, RuleError } from "../types.js";

export type ResourceHand = Record<ResourceType, number>;

export interface PlayerPieceSupply {
  /** Settlements left to place; increases by 1 when one is upgraded to a city. */
  readonly settlements: number;
  readonly cities: number;
  readonly roads: number;
}

export interface Player {
  readonly id: PlayerId;
  readonly hand: ResourceHand;
  readonly pieces: PlayerPieceSupply;
}

export type BuildingType = "settlement" | "city";

export interface Building {
  readonly playerId: PlayerId;
  readonly type: BuildingType;
}

export interface SetupPhase {
  readonly name: "setup";
  /** Snake draft order: seating order once, then reversed — length 2 * players.length. */
  readonly order: readonly PlayerId[];
  readonly step: number;
  /** True once this step's settlement is placed and its free road is still owed. */
  readonly awaitingRoad: boolean;
  /** The settlement just placed this step; the following road must attach to it. */
  readonly lastSettlementVertex: Vertex | null;
}

export interface RollPhase {
  readonly name: "roll";
}

export interface DiscardPhase {
  readonly name: "discard";
  /** Players who rolled a combined hand > 7 and still owe a discard. */
  readonly pending: ReadonlyMap<PlayerId, number>;
}

export interface RobberPhase {
  readonly name: "robber";
}

export interface MainPhase {
  readonly name: "main";
}

export interface EndedPhase {
  readonly name: "ended";
  readonly winner: PlayerId;
}

export type Phase = SetupPhase | RollPhase | DiscardPhase | RobberPhase | MainPhase | EndedPhase;

export interface GameState {
  readonly board: Board;
  readonly players: readonly Player[];
  readonly bank: ResourceHand;
  readonly buildings: ReadonlyMap<string, Building>; // keyed by Vertex.id
  readonly roads: ReadonlyMap<string, PlayerId>; // keyed by Edge.id
  readonly robber: Hex;
  /** Index into `players` of whoever may act next in a single-actor phase. */
  readonly currentPlayerIndex: number;
  readonly phase: Phase;
  /** Replayable RNG state consumed by dice rolls and robber steals. */
  readonly rngState: number;
  /** This turn's roll, if any; reset to null at the start of each turn. */
  readonly diceRoll: readonly [number, number] | null;
}

// --- Actions -----------------------------------------------------------

export interface PlaceSettlementAction {
  readonly type: "PLACE_SETTLEMENT";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface PlaceRoadAction {
  readonly type: "PLACE_ROAD";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

export interface RollDiceAction {
  readonly type: "ROLL_DICE";
  readonly playerId: PlayerId;
}

export interface MoveRobberAction {
  readonly type: "MOVE_ROBBER";
  readonly playerId: PlayerId;
  readonly hex: Hex;
  readonly stealFromPlayerId: PlayerId | null;
}

export interface DiscardAction {
  readonly type: "DISCARD";
  readonly playerId: PlayerId;
  readonly resources: Partial<ResourceHand>;
}

export interface BuildRoadAction {
  readonly type: "BUILD_ROAD";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

export interface BuildSettlementAction {
  readonly type: "BUILD_SETTLEMENT";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface BuildCityAction {
  readonly type: "BUILD_CITY";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface EndTurnAction {
  readonly type: "END_TURN";
  readonly playerId: PlayerId;
}

export type Action =
  | PlaceSettlementAction
  | PlaceRoadAction
  | RollDiceAction
  | MoveRobberAction
  | DiscardAction
  | BuildRoadAction
  | BuildSettlementAction
  | BuildCityAction
  | EndTurnAction;

// --- Events --------------------------------------------------------------

export interface SettlementPlacedEvent {
  readonly type: "SETTLEMENT_PLACED";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface RoadPlacedEvent {
  readonly type: "ROAD_PLACED";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

export interface StartingResourcesGrantedEvent {
  readonly type: "STARTING_RESOURCES_GRANTED";
  readonly playerId: PlayerId;
  readonly resources: Partial<ResourceHand>;
}

export interface SetupCompletedEvent {
  readonly type: "SETUP_COMPLETED";
}

export interface DiceRolledEvent {
  readonly type: "DICE_ROLLED";
  readonly playerId: PlayerId;
  readonly roll: readonly [number, number];
}

export interface ResourcesProducedEvent {
  readonly type: "RESOURCES_PRODUCED";
  readonly production: ReadonlyMap<PlayerId, Partial<ResourceHand>>;
}

export interface RoadBuiltEvent {
  readonly type: "ROAD_BUILT";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

export interface SettlementBuiltEvent {
  readonly type: "SETTLEMENT_BUILT";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface CityBuiltEvent {
  readonly type: "CITY_BUILT";
  readonly playerId: PlayerId;
  readonly vertex: Vertex;
}

export interface MustDiscardEvent {
  readonly type: "MUST_DISCARD";
  readonly playerId: PlayerId;
  readonly count: number;
}

export interface DiscardedEvent {
  readonly type: "DISCARDED";
  readonly playerId: PlayerId;
  readonly resources: Partial<ResourceHand>;
}

export interface RobberMovedEvent {
  readonly type: "ROBBER_MOVED";
  readonly playerId: PlayerId;
  readonly hex: Hex;
}

export interface ResourceStolenEvent {
  readonly type: "RESOURCE_STOLEN";
  readonly thiefId: PlayerId;
  readonly victimId: PlayerId;
  readonly resource: ResourceType;
}

export interface TurnStartedEvent {
  readonly type: "TURN_STARTED";
  readonly playerId: PlayerId;
}

export interface TurnEndedEvent {
  readonly type: "TURN_ENDED";
  readonly playerId: PlayerId;
}

export type GameEvent =
  | SettlementPlacedEvent
  | RoadPlacedEvent
  | StartingResourcesGrantedEvent
  | SetupCompletedEvent
  | DiceRolledEvent
  | ResourcesProducedEvent
  | RoadBuiltEvent
  | SettlementBuiltEvent
  | CityBuiltEvent
  | MustDiscardEvent
  | DiscardedEvent
  | RobberMovedEvent
  | ResourceStolenEvent
  | TurnStartedEvent
  | TurnEndedEvent;

export interface ApplySuccess {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ApplyResult = ApplySuccess | RuleError;

export function isRuleError(result: ApplyResult): result is RuleError {
  return "code" in result;
}
