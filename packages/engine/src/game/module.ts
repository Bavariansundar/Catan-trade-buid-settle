import type { Hex } from "../coordinates.js";
import { BASE_BOARD_SPEC, generateBoard as genericGenerateBoard } from "../board/generate.js";
import type { BoardSpec, GenerateBoardOptions } from "../board/generate.js";
import type { Board, HarborType, PlayerId, TerrainType } from "../types.js";
import { BASE_CONFIG } from "./config.js";
import type { GameConfig } from "./config.js";
import type { Action, ApplyResult, GameEvent, GameState } from "./types.js";

/**
 * A module's contribution to the board: extra hexes plus that module's own
 * terrain/number/harbor bag entries. Folded together with every other
 * active module's contribution (base's own 19-hex/18-token/9-harbor spec is
 * always the starting point) before the generic shuffle-and-place algorithm
 * runs. See docs/architecture/modules.md §2.
 */
export interface BoardExtension {
  readonly extraHexes: readonly Hex[];
  /** Length must equal `extraHexes.length`. */
  readonly extraTerrainBag: readonly TerrainType[];
  /** Length must equal the number of non-desert entries in `extraTerrainBag`. */
  readonly extraNumberBag: readonly number[];
  readonly extraHarborTypes: readonly HarborType[];
}

/** An additional actor/phase condition under which an action type becomes legal. */
export type ActionGate = (state: GameState, action: Action) => boolean;

/**
 * Validates and applies one action type. Receives the full active module
 * list so it can consult other modules' {@link RuleModule.extraActionGates}
 * (see docs/architecture/modules.md §4) — most handlers ignore this
 * parameter.
 */
export type ActionHandler<A extends Action = Action> = (
  state: GameState,
  action: A,
  modules: readonly RuleModule[],
) => ApplyResult;

type ActionHandlerMap = { [K in Action["type"]]?: ActionHandler<Extract<Action, { type: K }>> };

export interface RuleModule {
  readonly id: string;

  // Board
  readonly boardExtension?: BoardExtension;
  /** Full override of board generation (e.g. hand-designed scenario maps). Last module registered wins. */
  readonly generateBoard?: (options: GenerateBoardOptions) => Board;

  // Config: piece limits, starting bank, dev deck, valid player-count/VP-target ranges.
  readonly configExtension?: (config: GameConfig) => GameConfig;

  // Turn gating: OR'd with whatever base (or an earlier module) already allows for these action types.
  readonly extraActionGates?: Partial<Record<Action["type"], ActionGate>>;

  // Action ownership: which module validates/applies a given action type. Last module registered wins.
  readonly actionHandlers?: ActionHandlerMap;

  /**
   * Runs right after a turn's core END_TURN transition; can redirect
   * `phase` (e.g. insert an extra phase) and emit its own events.
   */
  readonly afterEndTurn?: (
    state: GameState,
    endedPlayerId: PlayerId,
  ) => { state: GameState; events?: readonly GameEvent[] };

  readonly extraVictoryPoints?: (state: GameState, playerId: PlayerId) => number;

  /**
   * Runs once, right after `createGame`'s core state is built, in module
   * order — lets a module inject its own initial state (e.g. seafarers
   * setting `pirateHex`/`hiddenHexes`/`discoveryBag` from its scenario).
   * Base and five-six-players don't need this; seafarers is the first
   * module that does.
   */
  readonly initGameState?: (state: GameState) => GameState;
}

/** Folds every active module's `configExtension` over {@link BASE_CONFIG}, in order. */
export function resolveConfig(modules: readonly RuleModule[]): GameConfig {
  return modules.reduce(
    (config, module) => module.configExtension?.(config) ?? config,
    BASE_CONFIG,
  );
}

/** Folds every active module's `boardExtension` over the base 19-hex spec, in order. */
export function assembleBoardSpec(modules: readonly RuleModule[]): BoardSpec {
  return modules.reduce((spec, module) => {
    const ext = module.boardExtension;
    if (!ext) return spec;
    return {
      hexes: [...spec.hexes, ...ext.extraHexes],
      terrainBag: [...spec.terrainBag, ...ext.extraTerrainBag],
      numberBag: [...spec.numberBag, ...ext.extraNumberBag],
      harborTypes: [...spec.harborTypes, ...ext.extraHarborTypes],
    };
  }, BASE_BOARD_SPEC);
}

/**
 * The board generator to use for this module list: the last module
 * providing a full `generateBoard` override if any, else the generic
 * shuffle-and-place algorithm over the assembled spec.
 */
export function resolveBoardGenerator(
  modules: readonly RuleModule[],
): (options: GenerateBoardOptions) => Board {
  const overridingModule = [...modules].reverse().find((m) => m.generateBoard);
  if (overridingModule?.generateBoard) {
    return (options) => overridingModule.generateBoard!(options);
  }
  const spec = assembleBoardSpec(modules);
  return (options) => genericGenerateBoard(spec, options);
}

/** Looks up which module (if any) owns handling `actionType`, last-registered wins. */
export function findActionHandler(
  modules: readonly RuleModule[],
  actionType: Action["type"],
): ActionHandler | undefined {
  for (let i = modules.length - 1; i >= 0; i--) {
    const handler = modules[i]!.actionHandlers?.[actionType];
    if (handler) return handler as ActionHandler;
  }
  return undefined;
}
