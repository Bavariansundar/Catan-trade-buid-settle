# Seafarers-Style Module — Rules Summary

Mechanics for Phase 5, following CLAUDE.md's brief (ships, multi-island
scenarios, the pirate, exploration, island-settlement VP). Per PROMPTS.md
this needs sign-off before implementation. Several numeric choices below
are proposals, not confirmed rules — flagged explicitly.

## 1. Ships

- **Cost**: 1 wood + 1 sheep (per CLAUDE.md).
- **Placement**: on a _sea edge_ — an edge where at least one adjacent hex
  is a sea hex (so coastal edges, land↔sea, are ship-eligible; a pure
  land↔land edge is not). Symmetrically, a _land edge_ (road-eligible) is
  one where neither adjacent hex is a sea hex. **This means coastal edges
  become ship-only** — a change from the base module, where every edge is
  road-eligible. Seafarers overrides `BUILD_ROAD`'s handler (wrapping,
  not rewriting, base's `validateBuildRoad`) to add the "not a sea edge"
  check — the same override mechanism Phase 4 documented for Cities &
  Knights' eventual dev-deck replacement, just needed one phase earlier
  than expected.
- **Connectivity**: identical rule shape to roads — a new ship must
  connect to the player's existing network (a ship, or a settlement/city,
  at one of its two endpoints).
- **Piece limit**: proposing **15**, matching roads. _(proposal)_
- **Moving an open ship**: once per turn, before other main-phase
  actions, a player may relocate one _open_ ship — a ship that is **not**
  adjacent to any of the player's own settlements/cities at either
  endpoint, and does **not** have another of the player's ships/roads
  connected at _both_ endpoints (i.e. it's a loose end of the network, not
  load-bearing). It's picked up and placed at any new legal, currently-open
  sea position (same connectivity + pirate-adjacency rules as building a
  new ship). New action `MOVE_SHIP { playerId, fromEdge, toEdge }`, gated
  to once per turn via a per-turn flag on the player (mirroring
  `devCardPlayedThisTurn`'s pattern).

## 2. Board: sea hexes and multi-island scenarios

`Board` gains an optional field:

```ts
interface Board {
  readonly tiles: readonly HexTile[]; // land only, unchanged
  readonly harbors: readonly Harbor[]; // unchanged
  readonly seaHexes?: readonly Hex[]; // NEW — empty/absent for base and five-six-players
}
```

Kept separate from `HexTile`/`TerrainType` deliberately: every existing
exhaustive switch over `TerrainType` (production, board validation) only
ever meant _land_ terrain, and this way none of them need a `"sea"` case
added defensively. A scenario's full play area is `tiles ∪ seaHexes`;
anything outside that union is simply off the map, same as today.

"Island" = a connected component of `tiles` hexes (hex-adjacency via the
existing `neighbors()`), computed with a pure `computeIslands(tiles)`
function — needed for both the exploration reward and the island VP bonus
below.

## 3. The pirate

A second robber-analog, for sea hexes: `pirateHex: Hex` in `GameState`
(set by the scenario's `pirateStartHex`; irrelevant/unused — stays at a
placeholder — for base and five-six-players).

- **Blocks**: no ship may be built or moved onto an edge adjacent to the
  pirate's hex (mirrors the land robber blocking a hex's production, but
  blocks _placement_ rather than _production_ — ships don't produce
  anything to block).
- **Moved on a 7 or a played knight**: same trigger as the robber, but the
  acting player chooses **one** of `MOVE_ROBBER` or `MOVE_PIRATE` (not
  both) — mirrors how five-six-players' special-build gate extension
  works: seafarers adds `MOVE_PIRATE` as a new action type, and extends
  the `robber`-phase gate so either action resolves it. Playing a knight
  still only ever triggers a robber-mechanics move (land or sea) once,
  same as today.
- **Steals**: 1 random resource from a player with a ship on an edge
  adjacent to the pirate's new hex (parallel to the land robber stealing
  from a settlement owner) — reuses the existing `eligibleStealTargets` /
  random-card-pick machinery, just sourced from `state.ships` instead of
  `state.buildings`.

## 4. Exploration

Some of a scenario's land hexes start **hidden**: face-down, no known
terrain/number. `GameState` gains:

```ts
readonly hiddenHexes: ReadonlyMap<string, true>; // hexKey -> still face-down
readonly discoveryBag: readonly { terrain: TerrainType; number: number | null }[]; // shuffled at game start
```

When a `BUILD_SHIP` (or `MOVE_SHIP`) places a ship on an edge adjacent to
a still-hidden hex, that hex is immediately revealed: pop the next entry
off `discoveryBag`, assign it as the hex's terrain/number (added to
`board.tiles` at that point — it wasn't real production-eligible terrain
until now), remove it from `hiddenHexes`. **Reward**: the discovering
player immediately receives 1 free card of the revealed terrain from the
bank (nothing for a revealed desert). _(proposal — real Seafarers has a
fancier "gold hex" mechanic; this is a simpler original substitute.)_

Reaching a hidden hex with a _settlement_ (via `BUILD_SETTLEMENT` on one
of its vertices, having sailed there) triggers the same reveal — a player
shouldn't be able to land on undiscovered terrain without it flipping.

## 5. Bonus VP for settling a new island

The island containing every scenario's starting setup placements is the
_home island_ — never eligible for the bonus. For every other island, the
**first** settlement any player builds there awards that player **+1 VP**,
once, permanently (not a transferable title like Longest Road — a
discovery credit, not a comparative one). _(proposal on the +1 amount —
real Seafarers scenarios vary this 1–2 VP by map.)_

```ts
readonly islandBonusAwarded: ReadonlyMap<string, PlayerId>; // island id -> who claimed it
```

Counted in `extraVictoryPoints` (the Phase 4 hook, exercised for the first
time here) — public VP, revealed the moment the settlement goes down.

## 6. Longest Route: roads + ships combined

Longest Road becomes **Longest Route** once ships exist: the existing
`computeLongestRoad(state, playerId)` is extended (not duplicated) to walk
`state.roads ∪ state.ships` as one network, tagging each edge with its
kind. The trail-search algorithm (edge-simple walk, blocked at _opponent_
vertices — see docs/coordinates.md and Phase 3) is unchanged; the only new
rule is at the **transition** between a road-kind edge and a ship-kind
edge: that's only allowed at a vertex holding the traveling player's own
settlement or city. Two roads (or two ships) chain through any open or
own-occupied vertex exactly as before. For base/five-six-players games
`state.ships` is empty, so every edge is road-kind and this rule never
engages — zero behavior change, confirmed by regression tests.

This is the nastiest new edge case, and gets the same dedicated test
treatment Phase 3's loop/fork/split cases got: a route that must switch
from ship to road (and back) through a settlement, and one that's blocked
from switching because the junction vertex is empty.

## 7. New actions & events (additions to the closed unions — see Phase 4 §1)

Actions: `BUILD_SHIP`, `MOVE_SHIP`, `MOVE_PIRATE`.
Events: `SHIP_BUILT`, `SHIP_MOVED`, `PIRATE_MOVED`, `HEX_DISCOVERED`,
`ISLAND_BONUS_AWARDED`.

## 8. Three scenario definitions

All verified programmatically (contiguous islands, correct separation,
no accidental adjacency) rather than hand-placed. Format:

```ts
interface ScenarioDefinition {
  readonly id: string;
  readonly recommendedPlayers: readonly [min: number, max: number];
  readonly knownLandTiles: readonly { hex: Hex; terrain: TerrainType; number: number | null }[];
  readonly hiddenLandHexes: readonly Hex[];
  readonly discoveryBag: readonly { terrain: TerrainType; number: number | null }[]; // shuffled at game start, length === hiddenLandHexes.length
  readonly seaHexes: readonly Hex[];
  readonly harbors: readonly Harbor[]; // fixed, not shuffled — same "printed on the frame" logic as base
  readonly pirateStartHex: Hex;
  readonly homeIslandHexes: readonly Hex[]; // never eligible for the island-settlement bonus
}
```

### 8a. Twin Isles (2–4 players)

Two equal 7-hex islands (radius-1 hexagons), centers 4 apart — closest
land-to-land distance 2, i.e. exactly one hex of open sea between their
nearest coasts. 14 land + 21 sea = 35 hexes total. Home island: whichever
island setup starts on (both fully known — small enough that hiding
either would make the game too swingy). The _other_ island is the sole
island-bonus target. Pirate starts in the open sea hex directly between
the two islands.

### 8b. The Strait (2–4 players)

One 19-hex home island (identical layout to the base board, fully known)
plus a 7-hex secondary island (radius-1), centers 5 apart along one axis
— closest land-to-land distance 2, a single-hex-wide strait. 26 land + 12
sea = 38 hexes. The secondary island's 7 hexes are **hidden**
(`discoveryBag` seeded with a terrain/number bag scaled for 7 tiles).
Pirate starts in the strait's sea hex, actively contesting the crossing.

### 8c. Scattered Archipelago (4–6 players — pairs with five-six-players)

One 19-hex home island (fully known, same layout as base) plus three
3-hex satellite islands, each ≥3 hexes of open sea from the home island
and ≥7 hexes from each other (well-scattered, no two satellites reachable
by the same short ship chain). 28 land + 48 sea = 76 hexes. All 9
satellite hexes are hidden. Pirate starts near the home island's coast,
away from any single satellite (doesn't favor blocking one exploration
route over another).

## 9. Open questions for sign-off

1. Ship piece limit (15, matching roads) and island-settlement bonus (+1
   VP) — both proposals above.
2. Discovery reward (1 free card of the revealed terrain, nothing for
   desert) — real Seafarers' "gold hex" mechanic is richer; I went with
   the simpler original substitute unless you'd like something closer to
   gold-hex behavior (e.g. choose any resource, or draw 2).
3. Scenario geometry/sizes in §8 — happy to adjust hex counts, add a 4th
   scenario, or rename any of them before implementing.
