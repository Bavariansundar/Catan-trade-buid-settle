import {
  addHands,
  applyAction,
  BUILD_COSTS,
  computePublicVictoryPoints,
  createGame,
  emptyHand,
  isRuleError,
  type Action,
  type GameEvent,
  type PlayerId,
  type ResourceHand,
  type RuleModule,
} from "@baychearsbar/engine";

export interface VpSnapshot {
  readonly turnNumber: number;
  readonly vpByPlayer: Readonly<Record<PlayerId, number>>;
}

export interface AwardDurations {
  readonly longestRoadTurns: number;
  readonly largestArmyTurns: number;
}

export interface GameStats {
  /** Sum of both dice, keyed 2-12. */
  readonly diceFrequency: Readonly<Record<number, number>>;
  readonly resourcesGainedPerPlayer: Readonly<Record<PlayerId, ResourceHand>>;
  readonly resourcesSpentPerPlayer: Readonly<Record<PlayerId, ResourceHand>>;
  /** Completed trades only — maritime executions plus accepted player trades, one count per participant. */
  readonly tradesPerPlayer: Readonly<Record<PlayerId, number>>;
  /** One snapshot per completed turn, plus a final one at game end. */
  readonly vpProgression: readonly VpSnapshot[];
  readonly awardTurnsHeld: Readonly<Record<PlayerId, AwardDurations>>;
  readonly settlementsBuiltPerPlayer: Readonly<Record<PlayerId, number>>;
  readonly citiesBuiltPerPlayer: Readonly<Record<PlayerId, number>>;
  readonly resourcesStolenPerPlayer: Readonly<Record<PlayerId, number>>;
  readonly discardsPerPlayer: Readonly<Record<PlayerId, number>>;
  /** How many times each player personally rolled a natural 7. */
  readonly sevensRolledPerPlayer: Readonly<Record<PlayerId, number>>;
  /** Who held each award at the moment the game ended — `null` if nobody did. */
  readonly finalLongestRoadHolder: PlayerId | null;
  readonly finalLargestArmyHolder: PlayerId | null;
  readonly winnerId: PlayerId | null;
}

interface PendingTrade {
  readonly proposerId: PlayerId;
  readonly offering: Partial<ResourceHand>;
  readonly requesting: Partial<ResourceHand>;
}

/**
 * Replays a game's full action log through the engine and tallies
 * everything the post-game stats screen and achievement checks need. Kept
 * as one pass over the event stream (rather than N separate scans) since a
 * long game's log is the dominant cost either way.
 */
export function aggregateGameStats(
  modules: readonly RuleModule[],
  playerIds: readonly PlayerId[],
  seed: string,
  targetVictoryPoints: number,
  actions: readonly Action[],
): GameStats {
  let state = createGame(modules, { playerIds, seed, targetVictoryPoints });

  const diceFrequency: Record<number, number> = {};
  const resourcesGainedPerPlayer: Record<PlayerId, ResourceHand> = {};
  const resourcesSpentPerPlayer: Record<PlayerId, ResourceHand> = {};
  const tradesPerPlayer: Record<PlayerId, number> = {};
  const vpProgression: VpSnapshot[] = [];
  const settlementsBuiltPerPlayer: Record<PlayerId, number> = {};
  const citiesBuiltPerPlayer: Record<PlayerId, number> = {};
  const resourcesStolenPerPlayer: Record<PlayerId, number> = {};
  const discardsPerPlayer: Record<PlayerId, number> = {};
  const sevensRolledPerPlayer: Record<PlayerId, number> = {};
  const pendingTrades = new Map<string, PendingTrade>();

  // Longest Road / Largest Army turn-holding tally: `heldSince[playerId]` is
  // the turn number the current holder started holding it; flushed into
  // `awardTurnsHeld` whenever the holder changes or the game ends.
  let longestRoadHolder: PlayerId | null = null;
  let longestRoadHeldSince = 0;
  let largestArmyHolder: PlayerId | null = null;
  let largestArmyHeldSince = 0;
  const longestRoadTurns: Record<PlayerId, number> = {};
  const largestArmyTurns: Record<PlayerId, number> = {};

  for (const id of playerIds) {
    resourcesGainedPerPlayer[id] = emptyHand();
    resourcesSpentPerPlayer[id] = emptyHand();
    tradesPerPlayer[id] = 0;
    settlementsBuiltPerPlayer[id] = 0;
    citiesBuiltPerPlayer[id] = 0;
    resourcesStolenPerPlayer[id] = 0;
    discardsPerPlayer[id] = 0;
    sevensRolledPerPlayer[id] = 0;
    longestRoadTurns[id] = 0;
    largestArmyTurns[id] = 0;
  }

  const gain = (playerId: PlayerId, amount: Partial<ResourceHand>): void => {
    resourcesGainedPerPlayer[playerId] = addHands(
      resourcesGainedPerPlayer[playerId] ?? emptyHand(),
      amount,
    );
  };
  const spend = (playerId: PlayerId, amount: Partial<ResourceHand>): void => {
    resourcesSpentPerPlayer[playerId] = addHands(
      resourcesSpentPerPlayer[playerId] ?? emptyHand(),
      amount,
    );
  };

  function snapshotVp(turnNumber: number): void {
    const vpByPlayer: Record<PlayerId, number> = {};
    for (const id of playerIds) vpByPlayer[id] = computePublicVictoryPoints(modules, state, id);
    vpProgression.push({ turnNumber, vpByPlayer });
  }

  function handleEvent(event: GameEvent): void {
    switch (event.type) {
      case "DICE_ROLLED": {
        const sum = event.roll[0] + event.roll[1];
        diceFrequency[sum] = (diceFrequency[sum] ?? 0) + 1;
        if (sum === 7) {
          sevensRolledPerPlayer[event.playerId] = (sevensRolledPerPlayer[event.playerId] ?? 0) + 1;
        }
        break;
      }
      case "STARTING_RESOURCES_GRANTED":
        gain(event.playerId, event.resources);
        break;
      case "RESOURCES_PRODUCED":
        for (const [playerId, amount] of event.production) gain(playerId, amount);
        break;
      case "ROAD_BUILT":
        spend(event.playerId, BUILD_COSTS.road);
        break;
      case "SETTLEMENT_BUILT":
        spend(event.playerId, BUILD_COSTS.settlement);
        settlementsBuiltPerPlayer[event.playerId] =
          (settlementsBuiltPerPlayer[event.playerId] ?? 0) + 1;
        break;
      case "CITY_BUILT":
        spend(event.playerId, BUILD_COSTS.city);
        citiesBuiltPerPlayer[event.playerId] = (citiesBuiltPerPlayer[event.playerId] ?? 0) + 1;
        break;
      case "DEV_CARD_BOUGHT":
        spend(event.playerId, BUILD_COSTS.devCard);
        break;
      case "MARITIME_TRADE_EXECUTED":
        spend(event.playerId, { [event.gave]: event.gaveAmount });
        gain(event.playerId, { [event.got]: 1 });
        tradesPerPlayer[event.playerId] = (tradesPerPlayer[event.playerId] ?? 0) + 1;
        break;
      case "TRADE_PROPOSED":
        pendingTrades.set(event.tradeId, {
          proposerId: event.proposerId,
          offering: event.offering,
          requesting: event.requesting,
        });
        break;
      case "TRADE_ACCEPTED": {
        const pending = pendingTrades.get(event.tradeId);
        if (pending) {
          spend(pending.proposerId, pending.offering);
          gain(pending.proposerId, pending.requesting);
          spend(event.accepterId, pending.requesting);
          gain(event.accepterId, pending.offering);
          tradesPerPlayer[pending.proposerId] = (tradesPerPlayer[pending.proposerId] ?? 0) + 1;
          tradesPerPlayer[event.accepterId] = (tradesPerPlayer[event.accepterId] ?? 0) + 1;
        }
        pendingTrades.delete(event.tradeId);
        break;
      }
      case "TRADE_REJECTED":
        break;
      case "TRADE_CANCELLED":
        pendingTrades.delete(event.tradeId);
        break;
      case "TRADE_COUNTERED":
        pendingTrades.delete(event.originalTradeId);
        break;
      case "RESOURCE_STOLEN":
        resourcesStolenPerPlayer[event.thiefId] =
          (resourcesStolenPerPlayer[event.thiefId] ?? 0) + 1;
        break;
      case "DISCARDED":
        discardsPerPlayer[event.playerId] = (discardsPerPlayer[event.playerId] ?? 0) + 1;
        break;
      case "MONOPOLY_PLAYED":
        for (const [victimId, amount] of event.seized) {
          gain(event.playerId, { [event.resource]: amount });
          spend(victimId, { [event.resource]: amount });
        }
        break;
      case "YEAR_OF_PLENTY_PLAYED":
        for (const resource of event.resources) gain(event.playerId, { [resource]: 1 });
        break;
      case "LONGEST_ROAD_AWARDED":
        if (longestRoadHolder) {
          longestRoadTurns[longestRoadHolder] =
            (longestRoadTurns[longestRoadHolder] ?? 0) + (state.turnNumber - longestRoadHeldSince);
        }
        longestRoadHolder = event.playerId;
        longestRoadHeldSince = state.turnNumber;
        break;
      case "LONGEST_ROAD_LOST":
        if (longestRoadHolder) {
          longestRoadTurns[longestRoadHolder] =
            (longestRoadTurns[longestRoadHolder] ?? 0) + (state.turnNumber - longestRoadHeldSince);
        }
        longestRoadHolder = null;
        break;
      case "LARGEST_ARMY_AWARDED":
        if (largestArmyHolder) {
          largestArmyTurns[largestArmyHolder] =
            (largestArmyTurns[largestArmyHolder] ?? 0) + (state.turnNumber - largestArmyHeldSince);
        }
        largestArmyHolder = event.playerId;
        largestArmyHeldSince = state.turnNumber;
        break;
      case "TURN_ENDED":
        snapshotVp(state.turnNumber);
        break;
      default:
        break;
    }
  }

  let winnerId: PlayerId | null = null;
  for (const action of actions) {
    const result = applyAction(modules, state, action);
    if (isRuleError(result)) {
      throw new Error(`Stat aggregation replay failed: ${result.code} — ${result.message}`);
    }
    state = result.state;
    for (const event of result.events) {
      handleEvent(event);
      if (event.type === "GAME_ENDED") winnerId = event.winner;
    }
  }

  if (longestRoadHolder) {
    longestRoadTurns[longestRoadHolder] =
      (longestRoadTurns[longestRoadHolder] ?? 0) + (state.turnNumber - longestRoadHeldSince);
  }
  if (largestArmyHolder) {
    largestArmyTurns[largestArmyHolder] =
      (largestArmyTurns[largestArmyHolder] ?? 0) + (state.turnNumber - largestArmyHeldSince);
  }
  snapshotVp(state.turnNumber);

  const awardTurnsHeld: Record<PlayerId, AwardDurations> = {};
  for (const id of playerIds) {
    awardTurnsHeld[id] = {
      longestRoadTurns: longestRoadTurns[id] ?? 0,
      largestArmyTurns: largestArmyTurns[id] ?? 0,
    };
  }

  return {
    diceFrequency,
    resourcesGainedPerPlayer,
    resourcesSpentPerPlayer,
    tradesPerPlayer,
    vpProgression,
    awardTurnsHeld,
    settlementsBuiltPerPlayer,
    citiesBuiltPerPlayer,
    resourcesStolenPerPlayer,
    discardsPerPlayer,
    sevensRolledPerPlayer,
    finalLongestRoadHolder: longestRoadHolder,
    finalLargestArmyHolder: largestArmyHolder,
    winnerId,
  };
}
