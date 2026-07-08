# Coordinate Scheme

This is the addressing scheme for hexes, vertices, and edges in
`packages/engine`. It is the foundation every later phase builds on
(board generation, building placement, roads, longest-road graph search,
Seafarers-style islands, etc.), so it needs sign-off before implementation
starts.

## 1. Hexes: axial coordinates, pointy-top orientation

Each hex is addressed by an axial coordinate `{ q, r }` (integers). This is
equivalent to cube coordinates `(x, y, z)` with `x = q`, `z = r`,
`y = -x - z`, `x + y + z = 0` — cube form is used internally for distance
and rotation math, axial form is the stored/serialized representation.

Orientation is **pointy-top** (a point at top and bottom of each hex, flat
edges on the left/right) with rows offset horizontally — this matches the
classic 3/4/5/4/3 board layout. Pixel projection (for the renderer, not the
engine, but fixed here so both agree):

```
x_px = size * sqrt(3) * (q + r / 2)
y_px = size * 1.5 * r
```

The standard base board is every hex with cube distance ≤ 2 from the
origin `(0,0)`, giving exactly 19 hexes (1 + 6 + 12). Larger boards
(5–6 player expansion) extend this radius; irregular boards (Seafarers-style
islands) are just an arbitrary `Set<Hex>` — nothing about vertices/edges
below assumes a filled hexagon.

## 2. The six neighbor (edge) directions

Six directions, indexed 0–5, ordered by increasing angle (standard math
convention, 0° = East, counterclockwise positive; the on-screen rotation
direction doesn't matter as long as it's applied consistently):

| index | compass | axial delta `(dq, dr)` | angle |
| ----- | ------- | ---------------------- | ----- |
| 0     | E       | `(+1,  0)`             | 0°    |
| 1     | NE      | `(+1, -1)`             | 60°   |
| 2     | NW      | `( 0, -1)`             | 120°  |
| 3     | W       | `(-1,  0)`             | 180°  |
| 4     | SW      | `(-1, +1)`             | 240°  |
| 5     | SE      | `( 0, +1)`             | 300°  |

`neighbor(hex, dir) = hex + delta[dir]`. This table is the single source of
truth — corners and edges below are both derived from it, never hand-picked.

## 3. Vertices: canonical triples

In the infinite tiling, every vertex is shared by **exactly 3 hexes**
(fewer only because some of those 3 hexes aren't part of a finite board —
the vertex itself is still well-defined). So a vertex is identified by the
sorted 3-tuple of the axial coordinates of those hexes — not by a separate
vertex coordinate space.

Concretely, hex `H`'s 6 corners are indexed 0–5, corner `i` sitting between
edge-directions `i` and `(i+1) mod 6`, and touching the 3 hexes
`{ H, H + delta[i], H + delta[(i+1) mod 6] }`:

| corner index | between edges | touches         | compass (approx.) |
| ------------ | ------------- | --------------- | ----------------- |
| 0            | E–NE          | `H, H+E, H+NE`  | NE corner         |
| 1            | NE–NW         | `H, H+NE, H+NW` | N corner          |
| 2            | NW–W          | `H, H+NW, H+W`  | NW corner         |
| 3            | W–SW          | `H, H+W, H+SW`  | SW corner         |
| 4            | SW–SE         | `H, H+SW, H+SE` | S corner          |
| 5            | SE–E          | `H, H+SE, H+E`  | SE corner         |

A `Vertex`'s canonical id is its 3 touching hex coordinates **sorted** (by
`q` then `r`) and joined into a string key, e.g. `"0,0|0,-1|1,-1"`. Two
different `(hex, corner)` pairs that touch the same physical point always
produce the same sorted triple, so this is the canonicalization — there is
no separate "vertex coordinate," only this derived, order-independent key.
Off-board hexes in the triple are kept (not dropped) so board-edge vertices
still get a stable id; `viewFor`/rendering just checks which of the 3 hexes
actually exist on the board.

## 4. Edges: canonical pairs

Every edge in the infinite tiling is shared by **exactly 2 hexes**: `H` and
`H + delta[dir]` for edge-direction `dir` (0–5). An `Edge`'s canonical id is
those two hex coordinates **sorted**, joined the same way, e.g.
`"0,0|1,-1"`.

## 5. Why this instead of a dedicated vertex/edge coordinate grid

Alternatives considered: (a) doubled/offset coordinates that give vertices
and edges their own independent grid, (b) per-hex corner/edge object
identity with adjacency links maintained by hand during board construction.

Deriving vertices/edges from sorted hex-coordinate tuples instead means:

- **No separate grid math to get wrong** — every id is computed from the
  one hex neighbor table in §2, so corners/edges can't drift out of sync
  with hex adjacency.
- **Board-shape agnostic** — works identically for the 19-hex base board,
  the larger 5–6 player board, and arbitrary island layouts in
  Seafarers-style scenarios, since it never assumes a filled hexagon.
- **Trivial equality/hashing** — two `Vertex`/`Edge` values are the same
  iff their string keys match; no custom equality or spatial indexing
  needed for `Map`/`Set` usage (settlement placement, road graph, etc.).
- **Cheap connectivity queries** — "which edges touch this vertex" and
  "which vertices are the endpoints of this edge" are pure functions of
  the hex neighbor table, which is exactly what the distance rule, road
  connectivity, and the longest-road graph search (Phase 3) need.

## 6. Types (preview, Phase 1 will implement these)

```ts
interface Hex {
  q: number;
  r: number;
}
type HexEdgeDirection = 0 | 1 | 2 | 3 | 4 | 5; // E, NE, NW, W, SW, SE
type HexCornerDirection = 0 | 1 | 2 | 3 | 4 | 5; // see corner table above

interface Vertex {
  id: string;
  hexes: readonly [Hex, Hex, Hex];
} // sorted
interface Edge {
  id: string;
  hexes: readonly [Hex, Hex];
} // sorted
```

`Vertex`/`Edge` are always constructed via `vertexAt(hex, corner)` /
`edgeAt(hex, dir)` — never hand-built — so the sort/canonicalization can't
be bypassed.
