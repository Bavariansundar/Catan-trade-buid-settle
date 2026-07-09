import { createRngFromState } from "../rng.js";
import type { PlayerId } from "../types.js";
import { advanceBarbarianTrack } from "./barbarians.js";
import { computeProductionWithCommodities } from "./commodities.js";
import { pendingDiscardsWithWalls } from "./cityWalls.js";
import { drawProgressCardsForTrack } from "./progressCards.js";
import { addCommodities, addHands, subtractCommodities, subtractHands } from "./resources.js";
import type { ApplySuccess, DiscardPhase, EventFace, GameEvent, GameState } from "./types.js";

/**
 * Proposed 6-face distribution (2 Trade / 2 Politics / 1 Science / 1
 * Barbarian) — see docs/rules/cities-knights-style.md §3.
 */
export const EVENT_DIE_FACES: readonly EventFace[] = [
  "trade",
  "trade",
  "politics",
  "politics",
  "science",
  "barbarian",
];

/**
 * Cities & Knights-style replacement for `dice.ts`'s `rollDice`: rolls the
 * usual two production dice plus a third event die, resolves commodity-aware
 * production with the dynamic (wall-boosted) discard threshold, then
 * resolves the event die (a barbarian advance, or a free progress-card draw
 * for everyone eligible) — see docs/rules/cities-knights-style.md §1, §3, §6.
 */
export function rollDiceWithEvents(state: GameState, playerId: PlayerId): ApplySuccess {
  const rng = createRngFromState(state.rngState);
  const die1 = rng.int(1, 7);
  const die2 = rng.int(1, 7);
  const roll: readonly [number, number] = [die1, die2];
  const total = die1 + die2;
  const eventFace = EVENT_DIE_FACES[rng.int(0, EVENT_DIE_FACES.length)]!;

  const events: GameEvent[] = [
    { type: "DICE_ROLLED", playerId, roll },
    { type: "EVENT_DIE_ROLLED", face: eventFace },
  ];
  let state1: GameState = {
    ...state,
    rngState: rng.getState(),
    diceRoll: roll,
    eventRoll: eventFace,
  };
  let enteredDiscardOrRobber = false;

  if (total === 7) {
    enteredDiscardOrRobber = true;
    const pending = pendingDiscardsWithWalls(state1);
    if (pending.size > 0) {
      for (const [discardingPlayerId, count] of pending) {
        events.push({ type: "MUST_DISCARD", playerId: discardingPlayerId, count });
      }
      const phase: DiscardPhase = { name: "discard", pending };
      state1 = { ...state1, phase };
    } else {
      state1 = { ...state1, phase: { name: "robber" } };
    }
  } else {
    const { resources, commodities } = computeProductionWithCommodities(state1, total);
    let players = state1.players;
    let bank = state1.bank;
    let commodityBank = state1.commodityBank;
    for (const [pId, res] of resources) {
      players = players.map((p) => (p.id === pId ? { ...p, hand: addHands(p.hand, res) } : p));
      bank = subtractHands(bank, res);
    }
    for (const [pId, com] of commodities) {
      players = players.map((p) =>
        p.id === pId ? { ...p, commodities: addCommodities(p.commodities, com) } : p,
      );
      commodityBank = subtractCommodities(commodityBank, com);
    }
    if (resources.size > 0) events.push({ type: "RESOURCES_PRODUCED", production: resources });
    state1 = { ...state1, players, bank, commodityBank, phase: { name: "main" } };
  }

  if (eventFace === "barbarian") {
    const barbResult = advanceBarbarianTrack(state1);
    events.push(...barbResult.events);
    if (enteredDiscardOrRobber && barbResult.state.phase.name === "barbarianTribute") {
      // Defer: keep the 7's own phase running its course; the tribute
      // resolves once MOVE_ROBBER completes (robber.ts's moveRobber checks
      // deferredBarbarianTribute) — see docs/rules/cities-knights-style.md §3.
      state1 = {
        ...barbResult.state,
        phase: state1.phase,
        deferredBarbarianTribute: barbResult.state.phase.pending,
      };
    } else {
      state1 = barbResult.state;
    }
  } else {
    const drawResult = drawProgressCardsForTrack(state1, eventFace);
    state1 = drawResult.state;
    events.push(...drawResult.events);
  }

  return { state: state1, events };
}
