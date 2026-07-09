# Expansion Module Architecture

This is the plugin system `packages/engine` uses so the base game, the
5–6 player module, and later Seafarers-style and Cities & Knights-style
modules can compose instead of being copy-pasted variants of each other.
Per CLAUDE.md this needs sign-off before Phase 4 implementation starts.

## 1. What "module" means here, concretely

A `RuleModule` is a plain object of optional hook functions. `createGame`
and `applyAction` both take a `modules: readonly RuleModule[]` list (base
always first) and fold/dispatch across it. **Modules are not stored inside
`GameState`** — only `activeModuleIds: readonly string[]` is (so a saved
game records what it needs), and the caller (server, browser, bot harness,
tests) passes the actual `RuleModule[]` objects back in on every call. This
keeps `GameState` plain, JSON-serializable data, which event-sourced replay
depends on.

```ts
export interface RuleModule {
  readonly id: string; // "base" | "five-six-players" | "seafarers-style" | "cities-knights-style"

  // Board
  boardExtension?: BoardExtension;
  generateBoard?(options: GenerateBoardOptions): Board; // full override (scenario maps)

  // Config: piece limits, starting bank, dev deck, valid player-count/VP-target ranges
  configExtension?: Partial<GameConfig>;

  // Turn gating: extra (state, action) => boolean conditions under which an
  // ALREADY-REGISTERED action type becomes legal, on top of whatever base
  // (or an earlier module) already allows. OR'd together.
  extraActionGates?: Partial<Record<Action["type"], ActionGate>>;

  // Action ownership: which module validates/applies a given action type.
  // Last module registered for a type wins, so a later module can fully
  // replace an earlier one's handling (needed for C&K's dev-card overhaul).
  actionHandlers?: Partial<Record<Action["type"], ActionHandler>>;

  // Phase hooks
  afterEndTurn?(state: GameState, endedPlayerId: PlayerId): GameState;

  // Victory
  extraVictoryPoints?(state: GameState, playerId: PlayerId): number;
}
```

### An honest limitation, stated up front

TypeScript discriminated unions (`Action`, `GameEvent`, `Phase`) aren't
truly "open" — a new action type (this phase's `PASS_SPECIAL_BUILD`, a
future `BUILD_SHIP`) still gets added as a variant in `game/types.ts` when
its module is built. What's actually pluggable is **who validates/applies
it and under what gate** — that lives in the module object, not hardcoded
into `apply.ts`. This is a real tradeoff (not fully dynamic plugins) in
exchange for keeping compile-time exhaustiveness checking on the switch in
`apply.ts`, which has caught real bugs already in Phases 2–3. I think this
is the right tradeoff for a strict-TypeScript engine; flagging it because
it's exactly the kind of interface decision worth a second opinion before
three more phases build on it.

## 2. Board composition

`board/generate.ts` currently hardcodes the 19-hex radius-2 board. It
becomes parameterized by a `BoardSpec`:

```ts
export interface BoardSpec {
  readonly hexes: readonly Hex[];
  readonly terrainBag: readonly TerrainType[]; // length === hexes.length
  readonly numberBag: readonly number[]; // length === non-desert hex count
  readonly harborSlots: number;
  readonly harborTypes: readonly HarborType[]; // length === harborSlots
}
```

`assembleBoardSpec(modules)` starts from base's own spec (today's 19/18/9)
and concatenates each module's `boardExtension` contribution — extra hex
coordinates plus that module's own terrain/number/harbor bag entries — into
one combined spec. The **same** shuffle-and-place algorithm from Phase 1
runs over the combined spec (nothing about it was 19-specific in spirit,
just in its constants), so a bigger board isn't a different code path, it's
a bigger input. `validateBoard` becomes parameterized the same way instead
of asserting hardcoded counts.

`generateBoard` on a module is an escape hatch for boards that aren't
"shuffle a bag onto a hex list" at all — Seafarers scenario maps are
hand-designed, not random. If any active module provides `generateBoard`,
it fully replaces the default assembler (last one wins, same as action
handlers). Not used by five-six-players.

### Proposed five-six-players board extension

19 base hexes aren't enough coastline for 5–6 players. Proposal: extend the
hexagon into an elongated 6-row shape (union of two radius-2 hexagons,
centers 2 apart along the q-axis) — **28 hexes total, 9 more than base**:

```
row  hex count
-3   3
-2   5
-1   6
 0   6
 1   5
 2   3
```

This keeps the same "no two adjacent red numbers" and per-terrain-ratio
character as the base board, just bigger and oval instead of a regular
hexagon. I verified this shape is contiguous and reasonably symmetric by
generating it programmatically rather than hand-picking coordinates — happy
to render it if a picture would help decide.

Proposed extra bag contents for the 9 new hexes (roughly preserving base's
per-terrain ratios — 4:4:4:3:3:1 wood:wheat:sheep:brick:ore:desert scaled
to 9 more tiles):

- terrain: +2 wood, +2 wheat, +2 sheep, +1 brick, +1 ore, +1 desert (2
  deserts total on the 28-hex board)
- numbers: +8 tokens (one per non-desert extra hex): 3, 4, 5, 6, 8, 9, 10,
  11 — chosen to keep the 2/12 (rarest) and 6/8 (red, capped) counts from
  the base bag unchanged and just add one more of each of the
  next-most-common values
- harbors: +3 slots (12 total): 1 more generic (5 total), +1 wood, +1
  sheep (repeating 2 of the 5 resource types, so every resource still has
  at least one 2:1 port, some have two)

**This board layout and these counts are proposals, not confirmed rules —
I'd like your sign-off on the numbers specifically, not just the mechanism.**

## 3. Player count and config composition

```ts
export interface GameConfig {
  readonly playerCountRange: readonly [min: number, max: number];
  readonly pieceLimits: PlayerPieceSupply;
  readonly startingBank: ResourceHand;
  readonly devCardDeck: readonly DevCardType[]; // composition, pre-shuffle
  readonly buildCosts: typeof BUILD_COSTS;
  readonly targetVictoryPointsRange: readonly [min: number, max: number];
}
```

`resolveConfig(modules)` folds `configExtension` across modules in order;
each module gets the config as assembled so far and returns its edits
(e.g. widen `playerCountRange`, not replace it — five-six-players turns
`[2,4]` into `[2,6]` by taking the union, not overwriting it).

Proposed five-six-players deltas:

- `playerCountRange`: base `[2,4]` → union → `[2,6]`
- `pieceLimits`: **unchanged** — every player still gets 5 settlements / 4
  cities / 15 roads regardless of player count; this is a per-player
  limit, not a board-capacity one
- `startingBank`: base 19 of each → **+5 each → 24 of each**, since a
  6-player game draws down the bank faster per round and stalling on
  resource shortages more often would be a worse experience than in base
- `devCardDeck`: base 25 cards (14 knight / 5 VP / 2 monopoly / 2 road
  building / 2 year of plenty) → **+9 cards → 34 total** (+6 knight, +1
  VP, +0 monopoly, +1 road building, +1 year of plenty), keeping knights
  roughly the same _proportion_ of the deck since they're the most
  frequently played/most replaceable card
- `targetVictoryPointsRange`: unchanged, `[10,14]`

**Also proposals, not confirmed — same ask as the board numbers above.**

## 4. The special building phase

Real-rule source (CLAUDE.md Phase 4): _"after each player's turn, all
other players may build/buy dev cards, no trading."_

New `Phase` variant:

```ts
export interface SpecialBuildPhase {
  readonly name: "specialBuild";
  /** Remaining players still owed a turn, in seating order. */
  readonly queue: readonly PlayerId[];
  readonly endedPlayerId: PlayerId;
}
```

New action, owned by `five-six-players`:

```ts
export interface PassSpecialBuildAction {
  readonly type: "PASS_SPECIAL_BUILD";
  readonly playerId: PlayerId;
}
```

Flow: `five-six-players`'s `afterEndTurn(state, endedPlayerId)` hook runs
right after base's `endTurn()` core transition (which already advanced
`currentPlayerIndex` and set `phase = { name: "roll" }`). The hook saves
that "who rolls next" state isn't lost — it's simply what `queue` empties
into — and overwrites `phase` to `specialBuild` with `queue` = every other
player in seating order starting from the next player (i.e. the next
roller is included; they get a build chance before their own roll too).
`PASS_SPECIAL_BUILD` advances the queue; when it empties, phase becomes
`{ name: "roll" }` for whoever was originally next.

**Only** `BUILD_ROAD`, `BUILD_SETTLEMENT`, `BUILD_CITY`, and `BUY_DEV_CARD`
get an `extraActionGates` entry from `five-six-players` (phase is
`specialBuild` AND actor is `queue[0]`). Trading actions and
`PLAY_DEV_CARD` get no extra gate — matching "no trading" and the fact the
brief only says _buy_, not _play_ — so they stay main-phase-only exactly as
base already enforces, no changes needed to trading.ts, devCards.ts, or
their tests.

This is the one place base's dispatcher (`apply.ts`) needs to change:
its `requireMainPhaseCurrentPlayer` helper (used today by those same 4
action types + `END_TURN`) becomes "base's own check OR any active
module's `extraActionGates[action.type]`". Nothing inside
`building.ts`/`devCards.ts`'s validate functions changes — connectivity,
cost, and piece-limit rules are identical in both phases, only _who may
attempt them, when_ differs, which is exactly what this hook isolates.

## 5. "Base game becomes the first module"

Concretely: a new `game/modules/base.ts` assembles a `BASE_MODULE: RuleModule`
object whose `actionHandlers` map each existing action type to the
existing `validate*`/apply functions in `building.ts`, `dice.ts`,
`robber.ts`, `devCards.ts`, `trading.ts`, `setup.ts` — **unchanged**. No
rule logic moves or gets rewritten; this is a registration/wiring layer,
not a rewrite. `applyAction`/`createGame` become:

```ts
export function createGame(modules: readonly RuleModule[], options: CreateGameOptions): GameState;
export function applyAction(
  modules: readonly RuleModule[],
  state: GameState,
  action: Action,
): ApplyResult;
```

Existing call sites (tests, the integration test) update to
`applyAction([BASE_MODULE], state, action)`; a `five-six-players` game
uses `applyAction([BASE_MODULE, FIVE_SIX_PLAYERS_MODULE], state, action)`.

## 6. Composition proof (Phase 4 deliverable)

- A `five-six-players.test.ts` integration test scripting a 5-player game
  through setup, several turns including the special build phase, using
  `[BASE_MODULE, FIVE_SIX_PLAYERS_MODULE]`.
- Every existing Phase 2/3 test updated to pass `[BASE_MODULE]` explicitly
  and re-run unchanged — this is the "regression tests proving base-only
  games are unchanged" requirement: same assertions, same expected values,
  only the call signature changes.

## 7. Scope note for future phases

Seafarers-style will need `generateBoard` overrides (scenario maps), new
action types (ship building/movement), and probably a new phase for
exploration reveals. Cities & Knights will need the heaviest use of
`actionHandlers` override (replacing the dev card deck with progress
cards), `extraVictoryPoints` (metropolis), and likely a new hook this
design doesn't have yet for "disable a base VP source" (no Largest Army).
I'm not adding speculative hooks for those now — CLAUDE.md schedules a
rule doc + sign-off for each of those phases specifically, and per the
"if Claude Code proposes changing... the module interface mid-project,
stop and evaluate" guidance, I'd rather extend this interface honestly
when Phase 6 knows what it actually needs than guess wrong now.
