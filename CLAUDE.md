# Project: Hexhaven — Online Settlement Trading Game

A web + mobile-PWA multiplayer board game with mechanics in the style of classic
hex-based settlement/trading games. Supports 2–6 players, single-player vs. strong
AI bots, and three expansion modules.

## IP Constraints (non-negotiable)

- Use the original working name "Hexhaven" (or the name I provide later). Never use
  the trademarked name "Catan" in product code, UI text, package names, or assets.
- All artwork, card text, flavor text, and visual design must be original.
- Game mechanics (dice production, building costs, trading, etc.) are fine to implement.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript everywhere (strict mode)
- **packages/engine**: pure rules engine — zero dependencies on IO, sockets, or DB
- **packages/bots**: AI opponents (depends only on engine)
- **apps/server**: Node.js, Express, Socket.IO, PostgreSQL + Prisma, Redis (game state cache + pub/sub), JWT auth
- **apps/web**: React 18 + Vite, PWA (service worker, offline single-player), Zustand for state, SVG board rendering, Chart.js for stats
- **Testing**: Vitest (engine/bots), Jest + Supertest (server), Playwright (e2e)
- **Infra**: Docker + docker-compose, ESLint, Prettier, GitHub Actions CI

## Architecture Principles

1. **Engine purity**: `packages/engine` is a deterministic state machine.
   `applyAction(state, action) -> { state, events } | RuleError`. All randomness
   comes from an injectable seeded RNG (needed for MCTS simulations and replay).
2. **One engine, two modes**: single-player runs the engine in the browser
   (offline-capable); multiplayer runs the same engine on the server as the
   authoritative source. Clients never compute outcomes in multiplayer — they
   send actions, server validates and broadcasts resulting events.
3. **Expansions as rule modules**: the engine has a plugin system. A module can
   register new actions, board features, victory conditions, and phase hooks.
   Modules: `base`, `five-six-players`, `seafarers-style`, `cities-knights-style`.
   Modules must compose (e.g., seafarers + 5-6 players together).
4. **Hidden information discipline**: server sends each player a redacted view
   (own hand visible, opponents' hands as counts only). The engine provides
   `viewFor(state, playerId)`.
5. **Event sourcing**: every game is an ordered log of validated actions +
   initial seed. Full replay = re-run the log. This powers reconnection,
   match history, and bot training.

## Bot AI

- Tier 1: rule-based bot (fast, used for easy difficulty and as MCTS rollout policy).
- Tier 2: heuristic bot with board evaluation (pip counts, port access, expansion paths).
- Tier 3: MCTS with determinization for hidden info (sample plausible opponent
  hands/dev cards, run ISMCTS), time-budgeted per move (configurable, default 2s).
- Bots run in a worker thread on the server; in a Web Worker in the browser for
  offline single-player.

## Conventions for Claude Code

- Work in the vertical slices defined in PROMPTS.md — one phase per session/branch.
- TDD: write failing tests first for every rule. Run the full test suite before
  declaring a phase done. Never move on with failing tests.
- Commit with conventional commits after each completed sub-task.
- Every rule the engine enforces must have at least one legal-move test and one
  illegal-move test.
- No `any` types. No game logic in controllers, socket handlers, or React components.
- When a rule is ambiguous, ask me rather than guessing — expansion rule
  interactions especially.

## Standard Game Rules Summary (base module)

- Board: 19 hexes (4 wood, 4 wheat, 4 sheep, 3 brick, 3 ore, 1 desert), number
  tokens 2–12 excluding 7, 9 harbors (4 generic 3:1, 5 resource-specific 2:1).
  Red numbers (6, 8) must not be adjacent.
- Setup: snake draft, 2 settlements + 2 roads each; second settlement grants
  adjacent resources.
- Turn: roll 2d6 → production (settlement=1, city=2, robber blocks) → trade
  (players + bank 4:1 / ports) → build (road 1W1B, settlement 1W1B1Wh1S,
  city 3O2Wh, dev card 1O1Wh1S) → may play 1 dev card per turn (not one
  bought this turn, except VP cards).
- 7: everyone with >7 cards discards half (round down), roller moves robber
  and steals 1 random card from an adjacent player.
- Distance rule: settlements need 2+ edge distance. Roads must connect.
- Piece limits per player: 15 roads, 5 settlements, 4 cities.
- Dev deck: 14 knights, 5 VP, 2 monopoly, 2 road building, 2 year of plenty.
- Longest Road (5+, must exceed to take), Largest Army (3+ knights): 2 VP each.
- Win: first to target VP (10 default, configurable 10–14) on your own turn.

Expansion module rule summaries live in `docs/rules/` — write them there during
the relevant phase and get my sign-off before implementing.
