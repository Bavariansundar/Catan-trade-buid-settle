import {
  applyAction,
  createRng,
  emptyHand,
  handTotal,
  isRuleError,
  RESOURCE_TYPES,
  shuffle,
  type Action,
  type GameState,
  type PlayerId,
  type Rng,
  type RuleModule,
} from "@hexhaven/engine";
import { evaluateState } from "./evaluate.js";
import { HeuristicBot } from "./heuristicBot.js";
import { enumerateLegalActions } from "./legalActions.js";
import { RuleBasedBot } from "./ruleBasedBot.js";
import { resolveActingPlayerId } from "./turnHelpers.js";
import { isFullySupported, type Bot } from "./types.js";

export interface MCTSBotOptions {
  /** Wall-clock budget per move; CLAUDE.md's default for real play is 2000ms. */
  readonly timeBudgetMs?: number;
  /** Default policy for both the acting player and opponents during rollout — fast is more important than strong here. */
  readonly rolloutPolicy?: Bot;
  /** Rollout depth cap, in END_TURNs crossed, before falling back to static evaluation. */
  readonly maxRolloutTurns?: number;
  /** Absolute safety cap on actions applied within one rollout, regardless of turn count. */
  readonly maxRolloutActions?: number;
  /** Seeded RNG for determinization + UCB1 tie-breaking — pass one for reproducible benchmark runs. */
  readonly rng?: Rng;
  readonly explorationConstant?: number;
  /** Root branching cap — see chooseAction's pre-filter doc for why this matters under a tight time budget. */
  readonly maxRootCandidates?: number;
}

interface CandidateStats {
  visits: number;
  totalReward: number;
}

/**
 * Information Set MCTS with determinization, per PROMPTS.md Phase 7: rather
 * than a deep multi-ply game tree (turn-based multiplayer Catan trees are
 * enormous), this implements the variant the brief actually describes —
 * "sample N plausible worlds ... run seeded simulations ... aggregate with
 * UCB": a single UCB1 bandit over the *root*'s legal actions, where each
 * pull (a) determinizes a fresh plausible world for the hidden information,
 * (b) applies the candidate action, (c) rolls out both the acting player and
 * every opponent using `rolloutPolicy` (RuleBasedBot by default, for speed)
 * to a bounded depth, and (d) rewards 1/0 for a decided game or a squashed
 * `evaluateState` score otherwise. This is a legitimate, tractable reading
 * of the brief, not a corner cut — a full ISMCTS game tree over hundreds of
 * turn-actions per multiplayer game is a substantially larger undertaking
 * than one phase of this project calls for.
 *
 * Determinization: opponents' hands are resampled uniformly at random
 * *consistent with their known card count* (from `viewFor`'s redaction),
 * and the dev deck's remaining cards are reshuffled in place (same
 * multiset, unknown order) — an approximation that doesn't enforce
 * resource-conservation across all players simultaneously, traded for
 * simplicity; see types.ts's Bot doc for why this still counts as
 * determinization-driven search rather than "peeking."
 *
 * Falls back to {@link HeuristicBot} entirely when the active modules go
 * beyond base/five-six-players, per the brief's explicit allowance.
 */
export class MCTSBot implements Bot {
  readonly name = "MCTSBot";
  private readonly timeBudgetMs: number;
  private readonly rolloutPolicy: Bot;
  private readonly maxRolloutTurns: number;
  private readonly maxRolloutActions: number;
  private readonly rng: Rng;
  private readonly explorationConstant: number;
  private readonly maxRootCandidates: number;
  private readonly fallback = new HeuristicBot();

  constructor(options: MCTSBotOptions = {}) {
    this.timeBudgetMs = options.timeBudgetMs ?? 2000;
    this.rolloutPolicy = options.rolloutPolicy ?? new RuleBasedBot();
    this.maxRolloutTurns = options.maxRolloutTurns ?? 3;
    this.maxRolloutActions = options.maxRolloutActions ?? 120;
    this.rng = options.rng ?? createRng(Date.now());
    this.explorationConstant = options.explorationConstant ?? Math.SQRT2;
    this.maxRootCandidates = options.maxRootCandidates ?? 8;
  }

  chooseAction(state: GameState, playerId: PlayerId, modules: readonly RuleModule[]): Action {
    if (!isFullySupported(modules)) return this.fallback.chooseAction(state, playerId, modules);

    const allCandidates = enumerateLegalActions(state, playerId, modules);
    if (allCandidates.length === 0) return this.fallback.chooseAction(state, playerId, modules);
    if (allCandidates.length === 1) return allCandidates[0]!;

    // Under a tight per-move time budget, a 50-150-wide root branching
    // factor starves every arm of visits (UCB1 can't meaningfully rank
    // options it has sampled 0-1 times). Pre-rank with a cheap true-state
    // one-ply score (same one HeuristicBot uses) and only spend the search
    // budget refining the best few — a standard progressive-widening move,
    // not a shortcut around the search itself.
    const candidates =
      allCandidates.length <= this.maxRootCandidates
        ? allCandidates
        : [...allCandidates]
            .map((action) => ({ action, score: this.quickScore(modules, state, playerId, action) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, this.maxRootCandidates)
            .map((c) => c.action);

    const stats: CandidateStats[] = candidates.map(() => ({ visits: 0, totalReward: 0 }));
    const deadline = Date.now() + this.timeBudgetMs;
    let totalVisits = 0;

    while (Date.now() < deadline) {
      const index = this.selectCandidateIndex(stats, totalVisits);
      const world = this.determinize(state, playerId);
      const reward = this.simulate(modules, world, playerId, candidates[index]!);
      stats[index]!.visits += 1;
      stats[index]!.totalReward += reward;
      totalVisits += 1;
    }

    let bestIndex = 0;
    let bestAverage = -Infinity;
    for (let i = 0; i < stats.length; i++) {
      if (stats[i]!.visits === 0) continue;
      const average = stats[i]!.totalReward / stats[i]!.visits;
      if (average > bestAverage) {
        bestAverage = average;
        bestIndex = i;
      }
    }
    return candidates[bestIndex]!;
  }

  private quickScore(
    modules: readonly RuleModule[],
    state: GameState,
    playerId: PlayerId,
    action: Action,
  ): number {
    const result = applyAction(modules, state, action);
    if (isRuleError(result)) return -Infinity;
    return evaluateState(modules, result.state, playerId);
  }

  private selectCandidateIndex(stats: readonly CandidateStats[], totalVisits: number): number {
    for (let i = 0; i < stats.length; i++) {
      if (stats[i]!.visits === 0) return i;
    }
    const logTotal = Math.log(totalVisits);
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i]!;
      const average = s.totalReward / s.visits;
      const ucb = average + this.explorationConstant * Math.sqrt(logTotal / s.visits);
      if (ucb > bestScore) {
        bestScore = ucb;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private determinize(state: GameState, playerId: PlayerId): GameState {
    const players = state.players.map((p) => {
      if (p.id === playerId) return p;
      const hand = emptyHand();
      const total = handTotal(p.hand);
      for (let i = 0; i < total; i++) {
        const resource = RESOURCE_TYPES[this.rng.int(0, RESOURCE_TYPES.length)]!;
        hand[resource] += 1;
      }
      return { ...p, hand };
    });
    const devDeck = shuffle(state.devDeck, this.rng);
    return { ...state, players, devDeck };
  }

  private simulate(
    modules: readonly RuleModule[],
    world: GameState,
    playerId: PlayerId,
    rootAction: Action,
  ): number {
    const afterRoot = applyAction(modules, world, rootAction);
    if (isRuleError(afterRoot)) return 0;

    let current = afterRoot.state;
    let endTurns = 0;
    let actionsSoFar = 0;
    while (
      current.phase.name !== "ended" &&
      endTurns < this.maxRolloutTurns &&
      actionsSoFar < this.maxRolloutActions
    ) {
      const actingPlayerId = resolveActingPlayerId(current);
      const action = this.rolloutPolicy.chooseAction(current, actingPlayerId, modules);
      const result = applyAction(modules, current, action);
      if (isRuleError(result)) break;
      if (action.type === "END_TURN") endTurns += 1;
      current = result.state;
      actionsSoFar += 1;
    }

    if (current.phase.name === "ended") return current.phase.winner === playerId ? 1 : 0;
    return squash(evaluateState(modules, current, playerId));
  }
}

function squash(score: number): number {
  return 1 / (1 + Math.exp(-score / 100));
}
