import type { Edge, Hex, Vertex } from "../coordinates.js";
import type { Board, PlayerId, ResourceType, RuleError, TerrainType } from "../types.js";

export type ResourceHand = Record<ResourceType, number>;

export interface PlayerPieceSupply {
  /** Settlements left to place; increases by 1 when one is upgraded to a city. */
  readonly settlements: number;
  readonly cities: number;
  readonly roads: number;
  /** Seafarers-style only; 0 for base and five-six-players. */
  readonly ships: number;
}

export type DevCardType =
  "knight" | "victory_point" | "monopoly" | "road_building" | "year_of_plenty";

export interface DevCardInstance {
  readonly type: DevCardType;
  /** `turnNumber` when bought — cards bought this turn can't be played yet. */
  readonly boughtTurn: number;
}

export interface Player {
  readonly id: PlayerId;
  readonly hand: ResourceHand;
  readonly pieces: PlayerPieceSupply;
  readonly devCards: readonly DevCardInstance[];
  readonly knightsPlayed: number;
  readonly devCardPlayedThisTurn: boolean;
  /** Seafarers-style only: has this player already relocated an open ship this turn? */
  readonly shipMovedThisTurn: boolean;
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

/**
 * five-six-players-only: after a turn ends, every other player (starting
 * from whoever rolls next) gets a chance to build/buy before the next
 * roll — see docs/architecture/modules.md §4.
 */
export interface SpecialBuildPhase {
  readonly name: "specialBuild";
  /** Remaining players still owed a turn, in seating order; `queue[0]` is up next. */
  readonly queue: readonly PlayerId[];
  readonly endedPlayerId: PlayerId;
}

export type Phase =
  SetupPhase | RollPhase | DiscardPhase | RobberPhase | MainPhase | EndedPhase | SpecialBuildPhase;

export interface TradeOffer {
  readonly id: string;
  readonly proposerId: PlayerId;
  readonly offering: Partial<ResourceHand>;
  readonly requesting: Partial<ResourceHand>;
  /** `null` = open to every other player. */
  readonly targetPlayerIds: readonly PlayerId[] | null;
  /** Players who have already declined this specific offer. */
  readonly rejectedBy: readonly PlayerId[];
}

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
  /** Replayable RNG state consumed by dice rolls, robber steals, and dev card shuffling. */
  readonly rngState: number;
  /** This turn's roll, if any; reset to null at the start of each turn. */
  readonly diceRoll: readonly [number, number] | null;
  readonly devDeck: readonly DevCardType[];
  readonly tradeOffers: ReadonlyMap<string, TradeOffer>;
  readonly nextTradeId: number;
  /** Increments on every END_TURN; used to gate "can't play a card bought this turn". */
  readonly turnNumber: number;
  readonly longestRoadPlayerId: PlayerId | null;
  readonly largestArmyPlayerId: PlayerId | null;
  readonly targetVictoryPoints: number;

  // --- Seafarers-style only (see docs/rules/seafarers-style.md) ---
  readonly ships: ReadonlyMap<string, PlayerId>; // keyed by Edge.id
  /** `null` when the module isn't active. */
  readonly pirateHex: Hex | null;
  /** Hexes still face-down; maps hexKey -> true. Empty when the module isn't active. */
  readonly hiddenHexes: ReadonlyMap<string, true>;
  /** Shuffled at game start; consumed front-to-back as hexes are discovered. */
  readonly discoveryBag: readonly { terrain: TerrainType; number: number | null }[];
  /** Island id (its lowest hexKey) -> who claimed the settlement bonus there. */
  readonly islandBonusAwarded: ReadonlyMap<string, PlayerId>;
  /** Hexes belonging to the starting island(s) — never eligible for the island bonus. */
  readonly homeIslandHexes: readonly Hex[];
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

/** Seafarers-style only. */
export interface BuildShipAction {
  readonly type: "BUILD_SHIP";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

/** Seafarers-style only: relocates one open ship, once per turn. */
export interface MoveShipAction {
  readonly type: "MOVE_SHIP";
  readonly playerId: PlayerId;
  readonly fromEdge: Edge;
  readonly toEdge: Edge;
}

/** Seafarers-style only: the sea-robber analog to MOVE_ROBBER, chosen instead of it on a 7/knight. */
export interface MovePirateAction {
  readonly type: "MOVE_PIRATE";
  readonly playerId: PlayerId;
  readonly hex: Hex;
  readonly stealFromPlayerId: PlayerId | null;
}

export interface EndTurnAction {
  readonly type: "END_TURN";
  readonly playerId: PlayerId;
}

/** five-six-players-only: declines further building, advancing the special build queue. */
export interface PassSpecialBuildAction {
  readonly type: "PASS_SPECIAL_BUILD";
  readonly playerId: PlayerId;
}

export interface ProposeTradeAction {
  readonly type: "PROPOSE_TRADE";
  readonly playerId: PlayerId;
  readonly offering: Partial<ResourceHand>;
  readonly requesting: Partial<ResourceHand>;
  readonly targetPlayerIds: readonly PlayerId[] | null;
}

export interface AcceptTradeAction {
  readonly type: "ACCEPT_TRADE";
  readonly playerId: PlayerId;
  readonly tradeId: string;
}

export interface RejectTradeAction {
  readonly type: "REJECT_TRADE";
  readonly playerId: PlayerId;
  readonly tradeId: string;
}

export interface CounterTradeAction {
  readonly type: "COUNTER_TRADE";
  readonly playerId: PlayerId;
  readonly tradeId: string;
  readonly offering: Partial<ResourceHand>;
  readonly requesting: Partial<ResourceHand>;
}

export interface CancelTradeAction {
  readonly type: "CANCEL_TRADE";
  readonly playerId: PlayerId;
  readonly tradeId: string;
}

export interface MaritimeTradeAction {
  readonly type: "MARITIME_TRADE";
  readonly playerId: PlayerId;
  readonly give: ResourceType;
  readonly get: ResourceType;
}

export interface BuyDevCardAction {
  readonly type: "BUY_DEV_CARD";
  readonly playerId: PlayerId;
}

export interface PlayKnightAction {
  readonly type: "PLAY_DEV_CARD";
  readonly card: "knight";
  readonly playerId: PlayerId;
  readonly hex: Hex;
  readonly stealFromPlayerId: PlayerId | null;
}

export interface PlayMonopolyAction {
  readonly type: "PLAY_DEV_CARD";
  readonly card: "monopoly";
  readonly playerId: PlayerId;
  readonly resource: ResourceType;
}

export interface PlayRoadBuildingAction {
  readonly type: "PLAY_DEV_CARD";
  readonly card: "road_building";
  readonly playerId: PlayerId;
  readonly edges: readonly Edge[];
}

export interface PlayYearOfPlentyAction {
  readonly type: "PLAY_DEV_CARD";
  readonly card: "year_of_plenty";
  readonly playerId: PlayerId;
  readonly resources: readonly [ResourceType, ResourceType];
}

export type PlayDevCardAction =
  PlayKnightAction | PlayMonopolyAction | PlayRoadBuildingAction | PlayYearOfPlentyAction;

export type Action =
  | PlaceSettlementAction
  | PlaceRoadAction
  | RollDiceAction
  | MoveRobberAction
  | DiscardAction
  | BuildRoadAction
  | BuildSettlementAction
  | BuildCityAction
  | BuildShipAction
  | MoveShipAction
  | MovePirateAction
  | EndTurnAction
  | PassSpecialBuildAction
  | ProposeTradeAction
  | AcceptTradeAction
  | RejectTradeAction
  | CounterTradeAction
  | CancelTradeAction
  | MaritimeTradeAction
  | BuyDevCardAction
  | PlayDevCardAction;

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

/** Seafarers-style only. */
export interface ShipBuiltEvent {
  readonly type: "SHIP_BUILT";
  readonly playerId: PlayerId;
  readonly edge: Edge;
}

export interface ShipMovedEvent {
  readonly type: "SHIP_MOVED";
  readonly playerId: PlayerId;
  readonly fromEdge: Edge;
  readonly toEdge: Edge;
}

export interface PirateMovedEvent {
  readonly type: "PIRATE_MOVED";
  readonly playerId: PlayerId;
  readonly hex: Hex;
}

export interface HexDiscoveredEvent {
  readonly type: "HEX_DISCOVERED";
  readonly playerId: PlayerId;
  readonly hex: Hex;
  readonly terrain: TerrainType;
  readonly number: number | null;
}

export interface IslandBonusAwardedEvent {
  readonly type: "ISLAND_BONUS_AWARDED";
  readonly playerId: PlayerId;
  readonly islandId: string;
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

export interface SpecialBuildStartedEvent {
  readonly type: "SPECIAL_BUILD_STARTED";
  readonly queue: readonly PlayerId[];
}

export interface SpecialBuildPassedEvent {
  readonly type: "SPECIAL_BUILD_PASSED";
  readonly playerId: PlayerId;
}

export interface SpecialBuildEndedEvent {
  readonly type: "SPECIAL_BUILD_ENDED";
}

export interface TradeProposedEvent {
  readonly type: "TRADE_PROPOSED";
  readonly tradeId: string;
  readonly proposerId: PlayerId;
  readonly offering: Partial<ResourceHand>;
  readonly requesting: Partial<ResourceHand>;
  readonly targetPlayerIds: readonly PlayerId[] | null;
}

export interface TradeAcceptedEvent {
  readonly type: "TRADE_ACCEPTED";
  readonly tradeId: string;
  readonly proposerId: PlayerId;
  readonly accepterId: PlayerId;
}

export interface TradeRejectedEvent {
  readonly type: "TRADE_REJECTED";
  readonly tradeId: string;
  readonly playerId: PlayerId;
}

export interface TradeCounteredEvent {
  readonly type: "TRADE_COUNTERED";
  readonly originalTradeId: string;
  readonly newTradeId: string;
  readonly playerId: PlayerId;
}

export interface TradeCancelledEvent {
  readonly type: "TRADE_CANCELLED";
  readonly tradeId: string;
}

export interface MaritimeTradeExecutedEvent {
  readonly type: "MARITIME_TRADE_EXECUTED";
  readonly playerId: PlayerId;
  readonly gave: ResourceType;
  readonly gaveAmount: number;
  readonly got: ResourceType;
}

export interface DevCardBoughtEvent {
  readonly type: "DEV_CARD_BOUGHT";
  readonly playerId: PlayerId;
  readonly card: DevCardType;
}

export interface KnightPlayedEvent {
  readonly type: "KNIGHT_PLAYED";
  readonly playerId: PlayerId;
}

export interface MonopolyPlayedEvent {
  readonly type: "MONOPOLY_PLAYED";
  readonly playerId: PlayerId;
  readonly resource: ResourceType;
  readonly seized: ReadonlyMap<PlayerId, number>;
}

export interface RoadBuildingPlayedEvent {
  readonly type: "ROAD_BUILDING_PLAYED";
  readonly playerId: PlayerId;
  readonly edges: readonly Edge[];
}

export interface YearOfPlentyPlayedEvent {
  readonly type: "YEAR_OF_PLENTY_PLAYED";
  readonly playerId: PlayerId;
  readonly resources: readonly [ResourceType, ResourceType];
}

export interface LongestRoadAwardedEvent {
  readonly type: "LONGEST_ROAD_AWARDED";
  readonly playerId: PlayerId;
  readonly length: number;
}

export interface LongestRoadLostEvent {
  readonly type: "LONGEST_ROAD_LOST";
  readonly playerId: PlayerId;
}

export interface LargestArmyAwardedEvent {
  readonly type: "LARGEST_ARMY_AWARDED";
  readonly playerId: PlayerId;
  readonly knights: number;
}

export interface GameEndedEvent {
  readonly type: "GAME_ENDED";
  readonly winner: PlayerId;
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
  | ShipBuiltEvent
  | ShipMovedEvent
  | PirateMovedEvent
  | HexDiscoveredEvent
  | IslandBonusAwardedEvent
  | MustDiscardEvent
  | DiscardedEvent
  | RobberMovedEvent
  | ResourceStolenEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | SpecialBuildStartedEvent
  | SpecialBuildPassedEvent
  | SpecialBuildEndedEvent
  | TradeProposedEvent
  | TradeAcceptedEvent
  | TradeRejectedEvent
  | TradeCounteredEvent
  | TradeCancelledEvent
  | MaritimeTradeExecutedEvent
  | DevCardBoughtEvent
  | KnightPlayedEvent
  | MonopolyPlayedEvent
  | RoadBuildingPlayedEvent
  | YearOfPlentyPlayedEvent
  | LongestRoadAwardedEvent
  | LongestRoadLostEvent
  | LargestArmyAwardedEvent
  | GameEndedEvent;

export interface ApplySuccess {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ApplyResult = ApplySuccess | RuleError;

export function isRuleError(result: ApplyResult): result is RuleError {
  return "code" in result;
}
