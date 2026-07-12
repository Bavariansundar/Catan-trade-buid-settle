# Mobile Full-Screen Game UX

Design for making the in-game experience mobile-friendly and full-screen —
board movement (pan/zoom), always-visible stats, touch-sized controls —
while reusing the existing component structure rather than rebuilding it.

**IP note**: the reference screenshots provided were from a licensed
commercial app. Only generic mobile-game *layout conventions* are adopted
here (full-bleed board, corner stat chips, bottom tray, radial/side action
buttons); all visuals stay our own existing walnut/gold theme, crest, and
resource icon set. No 3D avatars, shop, guilds, or metagame — out of scope.

## 0. The one structural idea

Today `GameTable.tsx` stacks four flex rows vertically:

```
[PlayerPanel strip]
[turn/dice bar]
[board (flex:1)]
[resource hand + ActionBar card]
```

On a phone the three chrome rows eat ~40% of a portrait screen and the
board gets whatever is left. The screenshots' pattern inverts that:

```
┌─────────────────────────────────┐
│ [P1][P2][P3][P4]     (top HUD)  │   ← overlay
│                                 │
│          BOARD                  │   ← fills 100% of the container
│      (pan / pinch-zoom)         │
│                                 │
│ [menu]  [resources...]  [dice]  │   ← overlay bottom tray
└─────────────────────────────────┘
```

**The board container becomes the screen; everything else floats above it
as absolutely-positioned overlays.** `GameTable` already does exactly this
for one element — the dev-card FAB (`hh-dev-buy-fab-wrap` inside the
`position: relative` board wrapper). The change is to move the other three
rows into that same pattern, not to rewrite them: `PlayerPanel`,
`DiceDisplay`, `ResourceHandBar`, `ActionBar`, `TradeDialog`, and
`DevCardBar` all keep their props and internals.

## 1. Full-screen game mode (app shell)

- `App.tsx`: hide the sticky header while a game is being played. Smallest
  correct mechanism: `useLocation()` + a `FULLSCREEN_ROUTES` check for
  `/play` and `/game/:id`. The header (and its nav) still exists everywhere
  else; in-game, a small "menu" button in the bottom tray (see §3) opens a
  sheet with Home / Rules / Leave Game links so navigation is never lost.
- `index.html`: extend the viewport meta with `viewport-fit=cover` (needed
  for edge-to-edge on notched phones); overlays pad with
  `env(safe-area-inset-*)` so chips never hide under a notch or the home
  indicator.
- `vite.config.ts` PWA manifest: `display: "fullscreen"` and
  `orientation: "landscape"` hints. Installed-PWA users get a truly
  chromeless game; browser users are unaffected.
- No Fullscreen API calls — the manifest + hidden header achieves the
  effect without permission prompts. (Can be added later behind a settings
  toggle if wanted.)

## 2. Board movement: pan + pinch-zoom

The board is one SVG with a computed `viewBox` (`HexBoard.tsx`). Zoom and
pan are therefore pure viewBox math — no canvas, no library:

- New hook `usePanZoom(bounds)` in `apps/web/src/board/` returning
  `{ viewBox, handlers }`. Internally tracks `{ cx, cy, scale }` and derives
  the viewBox string from the same `bounds` the component already computes.
- Gestures via **Pointer Events** (works for mouse + touch with one code
  path): one active pointer drags → pan; two active pointers → pinch scale
  around the midpoint; wheel → zoom for desktop. Clamp `scale` to
  [1, ~3.5] and clamp the center so the island can't be lost off-screen.
- Double-tap (or a small ⌂ reset button in a corner of the board) returns
  to the fitted view.
- Click-vs-drag disambiguation: suppress the vertex/edge/hex `onClick` if
  the pointer moved more than a few px between down and up — one guard in
  the hook, exposed as `wasDrag()`, checked at the top of the existing
  click handlers. Existing build/robber interactions otherwise unchanged.
- `touch-action: none` on the SVG (it currently sets `manipulation`) so
  the browser doesn't fight the gestures with native scrolling.

`HexBoard` changes are limited to: accept an optional `viewBox`/handlers
pair from the hook instead of always deriving a static one. Desktop keeps
working identically when the hook's initial state is "fitted, scale 1".

## 3. Overlay HUD

All overlays live inside the existing board wrapper `div`
(`position: relative`) in `GameTable.tsx`, which becomes `flex: 1` over the
whole screen once the sibling rows move into it.

**Top: player chips** — `PlayerPanel` is already a horizontal chip strip;
it gains a `compact` prop for narrow screens: colored disc + VP + hand
count only (≈64px per chip), tapping a chip expands it in place to the full
stats (dev cards, awards) for a few seconds. Positioned
`absolute; top: safe-area; left/right: 0`, transparent background so the
water shows through between chips.

**Bottom tray** — one overlay bar holding, left to right: menu button
(opens the sheet from §1), `ResourceHandBar` (already icon-first; on
mobile the labels drop and it shows icon + count only), and the contextual
main action from `ActionBar` (Roll Dice / End Turn — the single button a
player needs next, following the screenshots' "one primary action" idiom).
Build/Trade/dev-card actions collapse into a small "+" cluster next to it
(the existing dev-buy FAB pattern, extended to a 3-item stack: Build,
Trade, Dev cards). `ActionBar` keeps all its props; it just renders in two
groups instead of one row when a `compact` prop is set.

**Turn/dice status** — `DiceDisplay` + turn number shrink into a single
small centered pill at the top, under the chips (the current full-width
turn bar row is removed; its information density is low).

**Prompts** (discard picker, robber steal choice, road-building progress,
trade dialog) — already modal/card overlays; they only need
`max-width: 94vw` + safe-area padding audits, no structural change.

Pointer-events discipline: every overlay container is
`pointer-events: none` with `pointer-events: auto` on its interactive
children, so board gestures pass through the empty parts of the HUD.

## 4. Stats visibility

- The compact chips keep VP, hand count, and current-turn highlight
  permanently on screen (the "stats" requirement) — no information is
  gated behind a menu that the desktop layout shows today.
- Expanded chip (tap) shows dev-card count and award icons — same data
  `PlayerPanel` renders now.

## 5. Touch ergonomics (theme.css only)

- Media query block `@media (pointer: coarse)`: minimum 44×44px hit areas
  for `.hh-button`, steppers, and board FABs; slightly larger board piece
  hit circles (the invisible fat-hitbox lines/circles in `HexBoard`
  already exist — bump their radius under coarse pointers via a prop).
- Disable hover-only affordances under coarse pointers (`.hh-board-piece`
  hover scale becomes an active/pressed state instead).

## 6. What deliberately does NOT change

- Engine, worker, socket protocol, `viewFor` — zero changes.
- No new dependencies (no gesture library; Pointer Events + viewBox math).
- No new routes or screens; `SinglePlayerScreen` / `MultiplayerGameScreen`
  keep their responsibilities (they only lose the `padding: 1rem` shell
  in-game).
- Desktop layout: same components, and ≥900px-wide viewports keep roomier
  spacing via the same media queries — the overlay HUD is used everywhere
  (one layout, responsive sizing), which is *less* code than maintaining
  two layouts.

## 7. Implementation phases (each independently shippable)

| Phase | Scope | Touched files |
| --- | --- | --- |
| A | Full-screen shell: hide header in-game, viewport-fit, safe-area vars, manifest hints | `App.tsx`, `index.html`, `vite.config.ts`, `theme.css` |
| B | Overlay HUD: board wrapper fills screen; PlayerPanel `compact`, bottom tray, status pill | `GameTable.tsx`, `PlayerPanel.tsx`, `ActionBar.tsx`, `theme.css` |
| C | Pan/pinch-zoom + drag/click guard + reset view | new `board/usePanZoom.ts`, `HexBoard.tsx` |
| D | Touch polish: coarse-pointer hit areas, pressed states, dialog safe-area audit | `theme.css`, small `HexBoard`/dialog tweaks |

Estimated diff: ~2 new files (hook + this doc), style-level edits in ~6
existing components. No test churn expected outside `HexBoard.test.tsx`
and a new `usePanZoom` unit test.
