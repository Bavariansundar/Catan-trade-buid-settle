# Cities & Knights-Style Module — Rules Summary

Mechanics for Phase 6, following CLAUDE.md's brief (commodities, city
improvement tracks, progress cards, the event die, knights, the barbarian
attack cycle, city walls, metropolises). Per PROMPTS.md this is "the
largest module" and needs sign-off before implementation. This is also the
first module that fully **replaces** rather than extends several base
systems — every such replacement is called out explicitly in §9.

Numeric choices throughout are proposals, not confirmed rules — flagged
inline and collected in §10.

## 1. Commodities

A **city** (not a settlement) built on a sheep/ore/wood hex produces its
commodity **instead of** a second unit of the base resource when that hex
rolls — 1 base resource + 1 commodity, not 2 base resource. Cities on
brick/wheat hexes are unaffected (no commodity exists for those two;
still 2 resource, as today). Settlements never produce commodities.

```ts
export type CommodityType = "cloth" | "coin" | "paper";
export type CommodityHand = Record<CommodityType, number>;
const COMMODITY_FOR_TERRAIN: Partial<Record<TerrainType, CommodityType>> = {
  sheep: "cloth",
  ore: "coin",
  wood: "paper",
};
```

This requires a parallel production function (`computeProductionWithCommodities`)
rather than reusing `dice.ts`'s `computeProduction` as-is, since the
per-terrain branch (commodity vs. plain double-resource) doesn't exist in
the base version and building type + terrain now jointly decide the
split. C&K's `ROLL_DICE` handler owns this entirely (see §9.1).

`GameState` gains `commodityBank: CommodityHand`, a finite bank just like
resources — **proposing 10 of each** starting supply (smaller than the
resource bank's 19, since commodities are the "premium" currency and
should be able to run out). Bank-shortage behavior (nobody gets it if
demand exceeds supply across multiple players) mirrors `computeProduction`'s
existing resource-shortage rule exactly.

## 2. City improvement tracks

Three tracks, each powered by one commodity: **Trade** (cloth), **Politics**
(coin), **Science** (paper). Each player has an independent level 0–5 per
track.

```ts
export type Track = "trade" | "politics" | "science";
export interface CityImprovements {
  readonly trade: number; // 0-5
  readonly politics: number;
  readonly science: number;
}
```

**Cost to raise a track from level N to N+1: N+1 commodities of that
track's type** (escalating: 1, 2, 3, 4, 5 — 15 total to max a track).
_(proposal — a flat or differently-curved cost is easy to swap.)_

New action `IMPROVE_CITY_TRACK { playerId, track }`: gated like a build
action (main phase, current player — reuses `requireBuildGate`), requires
`canAfford` on the matching commodity, requires the player to own **at
least one city** (the track represents citywide institutions, not a
personal skill — you need a city to invest through). No cap other than 5.

**What each level does:**

- **Level ≥1**: eligible to draw from that track's progress card deck
  when the event die shows the matching color (§3).
- **Level ≥2 (Politics only)**: may promote a knight to Strong (§5).
- **Level ≥4 (Politics only)**: may promote a knight to Mighty (§5).
- **Level ≥4, any track, sole leader**: eligible to build a **metropolis**
  in that track (§7).

## 3. The event die and progress cards

Every `ROLL_DICE` now rolls **three** dice: the usual two production dice,
plus one **event die** with 6 faces. Proposed face distribution: **2×
Trade, 2× Politics, 1× Science, 1× Barbarian**. _(proposal — asymmetric on
purpose so Science, the track gating the strongest single card effects
below, draws slightly less often; happy to make it symmetric instead.)_

```ts
export type EventFace = "trade" | "politics" | "science" | "barbarian";
readonly eventDeckFaces: readonly EventFace[]; // the 6-face distribution above, not shuffled — a die, not a bag
```

Resolution order within one `ROLL_DICE` (all in the same action/event
batch): (1) production resolves exactly as base does, including entering
`discard` or `robber` phase on a 7 — the event die is a **separate**
physical die and always resolves regardless of the production total; (2)
event die resolves:

- **Trade / Politics / Science face**: every player with level ≥1 in
  the matching track draws the top card of that track's deck for free
  (no action required — resolved automatically as part of `ROLL_DICE`'s
  events, one `PROGRESS_CARD_DRAWN` event per drawing player). If that
  deck is empty, nothing happens for anyone (a deck can permanently run
  out).
- **Barbarian face**: advance the barbarian track by 1 (§6).

If a 7 was also rolled (discard/robber phase) **and** the barbarian face
also triggered an attack needing tribute choices (§6), both a `discard`
and a `barbarianTribute` phase can be simultaneously pending. Proposed
resolution order (a new `Phase` union has to pick _some_ order):
**`discard` → `robber` → `barbarianTribute` → `main`.** Each phase's
completion advances to the next pending one instead of jumping straight
to `main`. This is a genuinely rare double-trigger (7 **and** the
barbarian track crossing its threshold on the same roll) but the ordering
still has to be decided now rather than discovered as a bug later —
flagging it explicitly in §10 rather than silently picking.

### Progress card decks — proposed MVP roster

Each deck starts with the listed cards, shuffled at game start (same
`createRngFromState` pattern as the discovery bag). One card of each deck
is a **landmark** — worth +1 VP permanently the moment it's drawn (kept
by the player, not played/discarded; counted by `extraVictoryPoints`),
matching CLAUDE.md's "all card text must be original" constraint with
wholly original names and effects below.

**Trade deck (cloth) — 8 cards:**

| Card                     | Qty | Effect                                                                                          |
| ------------------------ | --- | ----------------------------------------------------------------------------------------------- |
| Bazaar                   | 3   | Trade with the bank at 2:1 for one resource, immediately, once.                                 |
| Toll Bridge              | 2   | For the rest of this turn, maritime-trade at 2:1 for any resource regardless of port ownership. |
| Windfall                 | 2   | Name a resource type; every other player with ≥1 of it gives you 1 (no compensation).           |
| Harbor Master (landmark) | 1   | +1 VP permanently, no other effect.                                                             |

**Politics deck (coin) — 8 cards:**

| Card                        | Qty | Effect                                                                              |
| --------------------------- | --- | ----------------------------------------------------------------------------------- |
| Mobilize                    | 3   | Activate all of your knights for free, immediately (no wheat cost).                 |
| Bribery                     | 2   | Steal 1 random commodity card of your choice of type from one opponent who has any. |
| Sabotage                    | 2   | Deactivate one opponent's active knight of your choice.                             |
| Founding Charter (landmark) | 1   | +1 VP permanently, no other effect.                                                 |

**Science deck (paper) — 7 cards:**

| Card                     | Qty | Effect                                                                                                      |
| ------------------------ | --- | ----------------------------------------------------------------------------------------------------------- |
| Blueprint                | 2   | Build 2 roads immediately, free (no cost, no connectivity requirement waived — still must legally connect). |
| Breakthrough             | 2   | Raise one of your own city-improvement tracks by 1 level, free (no commodity cost).                         |
| Apprentice               | 2   | Your next `IMPROVE_CITY_TRACK` this turn costs 1 less commodity (minimum 1).                                |
| Grand Library (landmark) | 1   | +1 VP permanently, no other effect.                                                                         |

23 cards total across three decks. _(proposal — counts, names, and effects
are all easy to adjust; this is deliberately a modest MVP roster rather
than attempting deck sizes/variety matching a full physical game, in
keeping with CLAUDE.md's "don't build beyond what's needed" guidance. Happy
to expand before or after this phase.)_

New action `PLAY_PROGRESS_CARD`, one variant per card (mirrors
`PlayDevCardAction`'s per-card-type shape), gated to the main phase/
current player (`requireBuildGate`) except where a card's effect implies
otherwise (none of the 9 above need an exception). Playing a landmark
card is not a thing — it's scored the instant it's drawn, never appears
as a playable action.

## 4. Piece and hand-size changes

```ts
interface Player {
  // ...existing...
  readonly commodities: CommodityHand;
  readonly cityImprovements: CityImprovements;
  readonly progressCards: readonly ProgressCardInstance[]; // excludes landmarks — those are scored on draw, not held as playable cards
  readonly knights: never; // knights are NOT held by the player — see §5, they're board pieces keyed by vertex like buildings
}
interface PlayerPieceSupply {
  // ...existing (settlements/cities/roads/ships)...
  readonly knights: number; // Cities & Knights-style only; proposing 3 (real-world-plausible small elite force, not a mass army)
  readonly cityWalls: number; // Cities & Knights-style only; proposing 5, matching the city limit
}
```

**Discard threshold becomes per-player-dynamic**: `7 + 2 × (city walls
that player has built)`, replacing the base module's flat 7. Since C&K's
`ROLL_DICE` handler already fully owns dice resolution (§1, §3), it
computes its own `pendingDiscards` variant with this dynamic threshold
rather than calling `dice.ts`'s exported one — see §9.3.

## 5. Knights

A knight is a board piece (not a card), one per vertex, tracked like
buildings:

```ts
export type KnightLevel = 1 | 2 | 3; // Basic / Strong / Mighty
export interface KnightInstance {
  readonly playerId: PlayerId;
  readonly level: KnightLevel;
  readonly active: boolean;
}
readonly knights: ReadonlyMap<string, KnightInstance>; // keyed by Vertex.id
```

- **`BUY_KNIGHT { playerId, vertex }`**: places a new level-1 (Basic),
  inactive knight. Cost **1 ore + 1 wheat + 1 sheep** _(proposal — reuses
  the base dev card's exact cost, deliberately, since it's the closest
  existing analog)_. The target vertex must be connected to the player's
  own road/ship network (same `hasShipConnectivity`-style check ships.ts
  already established) and must not already hold a knight (any player's)
  — but **may** coincide with the player's own settlement/city (a knight
  reinforcing a city it stands in), or with an empty vertex. Deliberately
  **not** subject to the settlement distance rule — knights aren't
  buildings and the real-game analog allows tight packing along a road.
  Piece-limited (3 per player, proposal above).
- **`ACTIVATE_KNIGHT { playerId, vertex }`**: cost 1 wheat, flips
  `active: false → true`. Inactive knights contribute nothing to defense
  and can't chase the robber.
- **`PROMOTE_KNIGHT { playerId, vertex }`**: level N → N+1, cost N coin
  (1 coin for 1→2, 2 coin for 2→3 — same escalating shape as track
  costs). Gated on the player's own **Politics** track level: ≥2 required
  to reach Strong, ≥4 required to reach Mighty. Doesn't change active
  status.
- **`MOVE_KNIGHT { playerId, fromVertex, toVertex }`**: relocate one of
  your own knights to another empty, network-connected vertex, free, main
  phase only, no once-per-turn limit proposed (unlike ships' open-ship
  rule — knights aren't structural the way ships are, moving one doesn't
  risk fragmenting a network the same way). _(proposal — could rate-limit
  this to once/turn per knight if it turns out to be too flexible.)_
- **`CHASE_ROBBER { playerId, knightVertex, toHex }`**: requires an
  **active** knight at `knightVertex` adjacent to the robber's current
  hex (shares an edge with it, i.e. the knight's vertex touches that
  hex). Moves the robber to `toHex` (any hex, same legality as
  `MOVE_ROBBER` minus the "must move off current hex" — trivially true
  here) **without stealing** — this is a displacement, not a
  robber-triggered steal. Deactivates the knight used (`active: true →
false`) as its cost. Self-gated (doesn't need `requireBuildGate`'s
  phase check — usable in the `main` phase like a build action, reuses
  the same gate).

Explicitly **not** implementing knight-vs-knight displacement (attacking
and evicting a weaker adjacent enemy knight) — CLAUDE.md's brief lists
knight abilities as exactly "activate/promote/move, chase robber," and
this trims real-world-analog scope that wasn't asked for. Can be added
later without disrupting anything above if wanted.

## 6. The barbarian attack cycle

```ts
readonly barbarianTrackPosition: number; // 0..attackThreshold
```

**Attack threshold**: proposing `3 × playerCount` (6 for 2p, 18 for 6p) —
scales with player count so the average real-time pace between attacks
stays roughly constant regardless of table size, mirroring how
five-six-players scaled the bank/dev-deck sizes by player count.
_(proposal)_

Each `barbarian` event-die face advances the position by 1. On reaching
the threshold: resolve the attack immediately, then reset position to 0.

- **Strength** = total number of cities across **all** players (not just
  the acting player).
- **Defense** = sum of the **level** (1/2/3) of every **active** knight
  across all players (not a headcount — a Mighty knight counts for 3).
- **Defense ≥ Strength (barbarians repelled)**: every player tied for the
  single highest active-knight-level sum (their own active knights only)
  gets **+1 VP**, immediately, permanently, public (`extraVictoryPoints`).
  No card choice, no phase — fully automatic. _(proposal — brief allows
  "VP or progress cards"; going with VP-only for simplicity, see §10.)_
- **Defense < Strength (barbarians win)**: every player tied for **fewest**
  active-knight-level sum, among players who own **at least one city**,
  must downgrade one city to a settlement (piece supply: settlements +1,
  cities −1 for them). A player with 0 active knights and 0 cities is
  simply not eligible to lose anything. If exactly one city is at stake
  for a given losing player, no real choice exists but they still submit
  it explicitly (uniform with `DISCARD`'s pattern, see below). New phase:

```ts
export interface BarbarianTributePhase {
  readonly name: "barbarianTribute";
  readonly pending: ReadonlyMap<PlayerId, number>; // player -> cities still owed
}
```

New action `CHOOSE_CITY_TO_DOWNGRADE { playerId, vertex }`, symmetric to
`DISCARD`: must reference the player's own city, decrements their
`pending` count, phase resolves to `main` once empty (or to `robber` if a
robber-phase move is also still pending from the same roll — see §3's
ordering proposal).

## 7. City walls and metropolises

**City wall**: `BUILD_CITY_WALL { playerId, vertex }`, cost 2 brick,
requires the player already owns a **city** at `vertex` without a wall
there yet. Piece-limited (5, matching the city limit — proposal above).
Purely a discard-threshold booster (§4); no other effect.

**Metropolis**: a track's **sole leader** (strictly highest level among
all players, level ≥4, no tie) may `BUILD_METROPOLIS { playerId, vertex,
track }` at one of their own cities on that track — upgrades it in place
(no piece cost; a metropolis isn't a new piece type, just a marker plus a
VP bump). Worth **+2 VP on top of** the city's normal 2 (4 total),
tracked as:

```ts
readonly metropolises: ReadonlyMap<Track, { readonly playerId: PlayerId; readonly vertex: string }>;
```

**Transfer, not lapse** (mirrors Largest Army's transfer-only behavior,
not Longest Road's lapse-on-break): if another player later becomes the
new sole leader (strictly exceeds the current metropolis holder's level
in that track), the metropolis **moves** to one of the new leader's own
cities on that track automatically (their choice, if they have more than
one eligible city — reuse the same "submit a vertex" action shape,
`BUILD_METROPOLIS` doubles as the transfer-claim action). The old
holder's city reverts to a plain city (back to 2 VP). If the former sole
leader is merely tied (not exceeded), the metropolis stays put — matches
the sole-leader requirement for the _original_ build too.

## 8. Victory points and target

`extraVictoryPoints` sums: landmark progress cards held (§3) + barbarian-
defense VP awards (§6) + 2 per metropolis held (§7) — all public, all
revealed the instant they're earned (no hidden VP in this module, keeping
`viewFor`'s redaction unaffected: nothing here duplicates `victory_point`
dev cards' hidden-until-revealed behavior).

Since a strong C&K game can rack up VP faster than base (metropolises
alone are 4 VP each vs. a city's 2), proposing this module's
`configExtension` widen `targetVictoryPointsRange` toward **[10, 16]**
(base is `[10, 14]`) so a table can reasonably choose to play to a higher
target without the engine rejecting the setting — the _default_ target
stays whatever `createGame`'s caller passes, this only widens the
allowed range. _(proposal)_

## 9. Base rules this module disables or replaces

1. **`BUY_DEV_CARD` / `PLAY_DEV_CARD` rejected outright.** C&K overrides
   both handlers to return a `RuleError` (e.g. `NOT_AVAILABLE`) — the dev
   deck concept is fully replaced by commodities + progress cards +
   knights. `state.devDeck` stays present (unused, always whatever
   `createGame` initialized) rather than removed, since `GameState`'s
   shape is shared across all modules; C&K simply never touches it.
2. **Largest Army never triggers — with no interface change needed.**
   Since knight dev cards no longer exist, `player.knightsPlayed` never
   increments under this module, so `recomputeLargestArmy` (which reads
   exactly that field) naturally always returns `null`. This confirms
   Phase 4's speculative "might need a new hook to disable a base VP
   source" was unnecessary — the existing hook surface already produces
   the right behavior for free. Worth a code comment where C&K is wired
   up so a future reader doesn't "fix" the apparent dead code path.
3. **Discard threshold**: C&K's `ROLL_DICE` handler computes pending
   discards with the dynamic `7 + 2×walls` threshold (§4) instead of
   calling `dice.ts`'s exported `pendingDiscards`, which stays hardcoded
   at 7 for base/five-six-players/seafarers.
4. **Production math**: C&K's `ROLL_DICE` handler computes production
   with its own commodity-aware function (§1) instead of `dice.ts`'s
   `computeProduction`.
5. **Robber can now move outside the 7/knight trigger**, via
   `CHASE_ROBBER` (§5) — an intentional addition, not a conflict, since
   it's a distinct main-phase action rather than a `robber`-phase entry.
6. **No new `RuleModule` interface hooks turned out to be necessary** —
   every mechanic above fits within the existing `actionHandlers` /
   `configExtension` / `extraVictoryPoints` / `initGameState` hooks from
   Phase 4. One new closed-union member is needed (`BarbarianTributePhase`
   in `Phase`, plus its handful of new `Action`/`GameEvent` variants),
   which is the same documented tradeoff every module so far has used —
   not a new category of extension point.

## 10. Open questions for sign-off

1. **Event die face distribution** (2 Trade / 2 Politics / 1 Science / 1
   Barbarian) — §3.
2. **Progress card roster** (23 cards across 3 decks, 9 distinct
   card types, 3 landmarks) — §3. Names/effects are original; open to
   expanding scope or reworking any individual card.
3. **Barbarian attack threshold** scaling (`3 × playerCount`), defense
   math (sum of active knight _levels_, not headcount), and the win
   reward being **VP-only** rather than "VP or a progress card" (brief
   allowed either) — §6.
4. **Phase-ordering proposal** for the rare double-trigger of a 7 +
   barbarian-attack-needing-tribute on the same roll: `discard` → `robber`
   → `barbarianTribute` → `main` — §3.
5. **Piece limits and costs**: 3 knights/player, 5 city walls/player,
   knight build cost (1 ore/1 wheat/1 sheep), track costs (1/2/3/4/5
   escalating commodities), promotion costs (1/2 coin) gated by Politics
   level (≥2 Strong, ≥4 Mighty) — §2, §5, §7.
6. **Commodity bank size** (10 each, vs. resources' 19) — §1.
7. **Metropolis bonus** (+2 VP on top of the city's own 2) and **target
   VP range widening** to `[10, 16]` — §7, §8.
8. Explicitly **not** implementing knight-vs-knight displacement (§5) —
   confirming that's the right scope cut, not an oversight.
