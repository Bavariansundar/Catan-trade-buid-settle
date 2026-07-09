import type { Hex } from "../../coordinates.js";
import type { PlayerId } from "../../types.js";
import type { BoardExtension, RuleModule } from "../module.js";
import type { DevCardType, GameState } from "../types.js";

/**
 * The 9 hexes extending the base 19-hex hexagon (radius-2 at origin) into
 * the elongated 28-hex board approved in docs/architecture/modules.md §2 —
 * base UNION a radius-2 hexagon centered at (2,-1), verified programmatically
 * to be a strict superset of the base hex set (rows 3,5,6,6,5,3).
 */
const EXTRA_HEXES: readonly Hex[] = [
  { q: 2, r: -3 },
  { q: 3, r: -3 },
  { q: 4, r: -3 },
  { q: 4, r: -2 },
  { q: 3, r: -2 },
  { q: 4, r: -1 },
  { q: 3, r: -1 },
  { q: 3, r: 0 },
  { q: 2, r: 1 },
];

const BOARD_EXTENSION: BoardExtension = {
  extraHexes: EXTRA_HEXES,
  extraTerrainBag: ["wood", "wood", "wheat", "wheat", "sheep", "sheep", "brick", "ore", "desert"],
  extraNumberBag: [3, 4, 5, 6, 8, 9, 10, 11],
  extraHarborTypes: ["generic", "wood", "sheep"],
};

const EXTRA_DEV_CARDS: readonly DevCardType[] = [
  ...Array<DevCardType>(6).fill("knight"),
  "victory_point",
  "road_building",
  "year_of_plenty",
];

function isMySpecialBuildTurn(state: GameState, playerId: PlayerId): boolean {
  return state.phase.name === "specialBuild" && state.phase.queue[0] === playerId;
}

function specialBuildQueueAfter(state: GameState, endedPlayerId: PlayerId): readonly PlayerId[] {
  const ids = state.players.map((p) => p.id);
  const endedIndex = ids.indexOf(endedPlayerId);
  const queue: PlayerId[] = [];
  for (let i = 1; i <= ids.length - 1; i++) {
    queue.push(ids[(endedIndex + i) % ids.length]!);
  }
  return queue;
}

/** Whoever rolls next once the special build phase (opened after `endedPlayerId`'s turn) finishes. */
function nextRollerAfterSpecialBuild(endedPlayerId: PlayerId, state: GameState): PlayerId {
  const ids = state.players.map((p) => p.id);
  const endedIndex = ids.indexOf(endedPlayerId);
  return ids[(endedIndex + 1) % ids.length]!;
}

export const FIVE_SIX_PLAYERS_MODULE: RuleModule = {
  id: "five-six-players",

  boardExtension: BOARD_EXTENSION,

  configExtension: (config) => ({
    ...config,
    playerCountRange: [
      Math.min(config.playerCountRange[0], 5),
      Math.max(config.playerCountRange[1], 6),
    ],
    startingBank: {
      wood: config.startingBank.wood + 5,
      wheat: config.startingBank.wheat + 5,
      sheep: config.startingBank.sheep + 5,
      brick: config.startingBank.brick + 5,
      ore: config.startingBank.ore + 5,
    },
    devCardDeck: [...config.devCardDeck, ...EXTRA_DEV_CARDS],
  }),

  extraActionGates: {
    BUILD_ROAD: (state, action) => isMySpecialBuildTurn(state, action.playerId),
    BUILD_SETTLEMENT: (state, action) => isMySpecialBuildTurn(state, action.playerId),
    BUILD_CITY: (state, action) => isMySpecialBuildTurn(state, action.playerId),
    BUY_DEV_CARD: (state, action) => isMySpecialBuildTurn(state, action.playerId),
    // Composed with seafarers-style: ships are a building action too, so
    // they get the same special-build allowance as the other 4.
    BUILD_SHIP: (state, action) => isMySpecialBuildTurn(state, action.playerId),
  },

  afterEndTurn: (state, endedPlayerId) => {
    const queue = specialBuildQueueAfter(state, endedPlayerId);
    if (queue.length === 0) return { state }; // shouldn't happen at 5+ players, but stay safe
    return {
      state: { ...state, phase: { name: "specialBuild", queue, endedPlayerId } },
      events: [{ type: "SPECIAL_BUILD_STARTED", queue }],
    };
  },

  actionHandlers: {
    PASS_SPECIAL_BUILD: (state, action) => {
      if (state.phase.name !== "specialBuild") {
        return { code: "WRONG_PHASE", message: "Not in the special build phase" };
      }
      if (state.phase.queue[0] !== action.playerId) {
        return {
          code: "NOT_YOUR_TURN",
          message: `It is not ${action.playerId}'s special build turn`,
        };
      }
      const { queue, endedPlayerId } = state.phase;
      const remaining = queue.slice(1);
      if (remaining.length === 0) {
        const rollerId = nextRollerAfterSpecialBuild(endedPlayerId, state);
        const currentPlayerIndex = state.players.findIndex((p) => p.id === rollerId);
        return {
          state: { ...state, phase: { name: "roll" }, currentPlayerIndex },
          events: [
            { type: "SPECIAL_BUILD_PASSED", playerId: action.playerId },
            { type: "SPECIAL_BUILD_ENDED" },
          ],
        };
      }
      return {
        state: { ...state, phase: { name: "specialBuild", queue: remaining, endedPlayerId } },
        events: [{ type: "SPECIAL_BUILD_PASSED", playerId: action.playerId }],
      };
    },
  },
};
