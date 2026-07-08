import type { Hex } from "../coordinates.js";
import type { Board, PlayerId } from "../types.js";
import { handTotal } from "./resources.js";
import { computePublicVictoryPoints } from "./victory.js";
import type {
  Building,
  DevCardInstance,
  Phase,
  Player,
  PlayerPieceSupply,
  ResourceHand,
  TradeOffer,
} from "./types.js";
import type { GameState } from "./types.js";

export interface RedactedPlayer {
  readonly id: PlayerId;
  /** Full hand for the viewer themselves; `null` for every other player. */
  readonly hand: ResourceHand | null;
  /** Total card count — always known, even when `hand` is redacted. */
  readonly handCount: number;
  readonly pieces: PlayerPieceSupply;
  /** Full dev card list for the viewer themselves; `null` for everyone else. */
  readonly devCards: readonly DevCardInstance[] | null;
  readonly devCardCount: number;
  /** Public knowledge — revealed the moment a knight is played. */
  readonly knightsPlayed: number;
  readonly devCardPlayedThisTurn: boolean;
}

export interface GameView {
  readonly board: Board;
  readonly players: readonly RedactedPlayer[];
  readonly bank: ResourceHand;
  readonly buildings: ReadonlyMap<string, Building>;
  readonly roads: ReadonlyMap<string, PlayerId>;
  readonly robber: Hex;
  readonly currentPlayerIndex: number;
  readonly phase: Phase;
  readonly diceRoll: readonly [number, number] | null;
  /** Card count only — deck order and contents are hidden. */
  readonly devDeckCount: number;
  readonly tradeOffers: ReadonlyMap<string, TradeOffer>;
  readonly turnNumber: number;
  readonly longestRoadPlayerId: PlayerId | null;
  readonly largestArmyPlayerId: PlayerId | null;
  readonly targetVictoryPoints: number;
  /** Each player's publicly-inferable VP (excludes anyone's hidden VP cards). */
  readonly publicVictoryPoints: ReadonlyMap<PlayerId, number>;
}

function redactPlayer(state: GameState, player: Player, viewerId: PlayerId): RedactedPlayer {
  const isSelf = player.id === viewerId;
  return {
    id: player.id,
    hand: isSelf ? player.hand : null,
    handCount: handTotal(player.hand),
    pieces: player.pieces,
    devCards: isSelf ? player.devCards : null,
    devCardCount: player.devCards.length,
    knightsPlayed: player.knightsPlayed,
    devCardPlayedThisTurn: player.devCardPlayedThisTurn,
  };
}

/**
 * The redacted view of `state` for `viewerId`: their own hand and dev cards
 * are visible in full; every other player's are collapsed to counts, and
 * the dev card deck is collapsed to its remaining size. Everything else
 * (board, buildings, roads, bank, awards, trade offers) is public.
 */
export function viewFor(state: GameState, viewerId: PlayerId): GameView {
  const publicVictoryPoints = new Map<PlayerId, number>();
  for (const player of state.players) {
    publicVictoryPoints.set(player.id, computePublicVictoryPoints(state, player.id));
  }

  return {
    board: state.board,
    players: state.players.map((p) => redactPlayer(state, p, viewerId)),
    bank: state.bank,
    buildings: state.buildings,
    roads: state.roads,
    robber: state.robber,
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    diceRoll: state.diceRoll,
    devDeckCount: state.devDeck.length,
    tradeOffers: state.tradeOffers,
    turnNumber: state.turnNumber,
    longestRoadPlayerId: state.longestRoadPlayerId,
    largestArmyPlayerId: state.largestArmyPlayerId,
    targetVictoryPoints: state.targetVictoryPoints,
    publicVictoryPoints,
  };
}
