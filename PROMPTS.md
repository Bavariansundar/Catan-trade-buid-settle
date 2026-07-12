# Claude Code Prompt Sequence — BayCheArsBar

Run these one at a time, in order. Start each in a fresh session (Claude Code
reads CLAUDE.md automatically). Don't start a phase until the previous one's
tests pass and the work is committed. After each phase, review the diff yourself
before committing to main.

---

## Phase 0 — Monorepo Scaffold

```text
Read CLAUDE.md. Scaffold the monorepo exactly as specified: pnpm workspaces +
Turborepo with packages/engine, packages/bots, apps/server, apps/web.

Set up: TypeScript strict configs (shared base tsconfig), ESLint + Prettier,
Vitest in packages, Jest + Supertest in apps/server, Docker +
docker-compose (Postgres, Redis, server, web), GitHub Actions CI running
lint + typecheck + all tests, and a root README with setup instructions.

Add one trivial passing test per package to prove the pipelines work.
No game logic yet. Verify `pnpm test`, `pnpm lint`, `pnpm build`, and
`docker compose up` all succeed before finishing. Commit.
```

## Phase 1 — Engine Core: State Model & Board Generation

```text
In packages/engine, implement:

1. The core types: GameState, Player, Hex, Vertex, Edge, Action, GameEvent,
   RuleError. Use cube or axial coordinates for hexes with a well-documented
   vertex/edge addressing scheme (this is the foundation everything builds on —
   propose the scheme to me with a short doc in docs/coordinates.md before coding).
2. Seeded RNG utility (injectable, replayable).
3. Board generator for the base 19-hex layout per CLAUDE.md: shuffled terrain,
   number tokens, harbors; desert gets no number; reject boards where 6 and 8
   are adjacent and regenerate.
4. Board validator as a separate pure function.
5. A property test that generates 10,000 boards and asserts: correct tile/token/
   harbor counts, no adjacent red numbers, desert numberless, statistical spread
   of layouts (no two consecutive seeds identical).

TDD. Commit when green.
```

## Phase 2 — Engine: Setup, Turns, Dice, Production, Building, Robber

```text
Extend packages/engine with the base-module game flow:

- Game creation (2–4 players for now), snake-draft setup phase with placement
  validation (distance rule, road attachment), second-settlement starting resources.
- Turn state machine: ROLL -> (DISCARD/ROBBER on 7) -> MAIN (trade/build) -> END.
  Enforce: only current player acts, exactly one roll per turn, phase-legal
  actions only.
- Dice roll + resource production (settlement 1, city 2, robber blocks, bank
  shortage rule: if the bank cannot pay everyone for a resource type, nobody
  receives that type unless only one player is affected).
- Building: roads, settlements, cities with cost, connectivity, distance rule,
  piece-limit, and terrain validation.
- Robber: discard-half on 7 for hands >7, robber move (must move to a new hex),
  random steal from a chosen adjacent player.

Every rule gets legal + illegal move tests. Also add a full-game integration
test: scripted 4-player game from setup to several rounds, asserting state
after each action. Commit when green.
```

## Phase 3 — Engine: Trading, Dev Cards, Special Awards, Victory

```text
Extend packages/engine:

- Trading: player-to-player offers (propose/accept/reject/counter/expire),
  bank 4:1, generic 3:1 ports, resource 2:1 ports. Validate ownership of
  offered resources at execution time, not just offer time.
- Development cards: correct deck composition, seeded shuffle, draw, and play
  rules (max one per turn, cannot play a card bought this turn, VP cards
  hidden until game end or winning). Implement knight, monopoly, road
  building, year of plenty effects.
- Longest Road: proper graph algorithm (longest simple path, broken by
  opponent settlements), 5+ minimum, must strictly exceed the holder to take.
  Include the nasty test cases: loops, forks, road networks split by a new
  enemy settlement causing the award to transfer or lapse.
- Largest Army: 3+ knights, strictly exceed to take.
- Victory: configurable target 10–14 VP, win only on your own turn, hidden VP
  cards counted, game ends immediately.
- Implement viewFor(state, playerId) redaction: own hand full, opponents as
  counts, dev cards hidden, deck order hidden.

Exhaustive tests including award-transfer edge cases. Commit when green.
```

## Phase 4 — Expansion Framework + 5–6 Player Module

```text
Design and implement the expansion module system in packages/engine:

- A RuleModule interface that can: extend the board definition, register new
  action types and validators, hook into phase transitions, modify costs/
  limits/deck composition, and add VP sources. Base game becomes the first
  module. Write docs/architecture/modules.md explaining the design first and
  wait for my approval before implementing.
- Then implement the five-six-players module: larger board layout (extra
  terrain, tokens, harbors), piece counts for 6 players, and the special
  building phase (after each player's turn, all other players may build/buy
  dev cards, no trading).
- Prove composition: tests that run full games with base+5-6 module, and
  regression tests proving base-only games are unchanged.

Commit when green.
```

## Phase 5 — Seafarers-Style Module

```text
Before coding: write docs/rules/seafarers-style.md summarizing the mechanics
we'll support — ships (build cost wood+sheep, placed on sea edges, open-ended
ship may be moved once per turn), mixed land/sea scenarios with multiple
islands, the pirate (sea robber blocking ship placement adjacent to it and
stealing from adjacent ship owners), exploration (face-down tiles revealed on
reaching them, with discovery reward), and bonus VP for settling new islands.
Include 2–3 concrete scenario map definitions. Wait for my sign-off.

Then implement as a RuleModule, including: longest route calculation combining
roads and ships (connected only through a settlement/city), scenario definition
format, and ship movement rules. Full test coverage including road/ship route
edge cases and pirate interactions. Composition tests with the 5-6 player
module. Commit when green.
```

## Phase 6 — Cities & Knights-Style Module

```text
This is the largest module. First write docs/rules/cities-knights-style.md
covering: commodities (cloth/coin/paper from cities on sheep/ore/wood), city
improvements in three tracks with escalating commodity costs, progress card
decks replacing dev cards (draw on matching event die color + track level),
the third die (event die), knights (activate/promote/move, chase robber),
the barbarian attack cycle (strength = cities, defense = active knights,
weakest player loses a city / defenders earn VP or progress cards), city
walls (raise discard limit), and metropolis VP for track leaders. Note every
place where this module must disable or replace a base rule (e.g., no Largest
Army, dev deck replaced). Wait for my sign-off.

Then implement as a RuleModule with exhaustive tests, especially: barbarian
resolution ties, metropolis transfer, knight displacement chains, and
interaction tests with the 5-6 player module. Commit when green.
```

## Phase 7 — Bots (packages/bots)

```text
Implement the three bot tiers per CLAUDE.md:

1. RuleBasedBot: legal-move sampler with simple priorities (build settlement >
   city > road toward best spot; sensible discard/robber choices). Must never
   propose an illegal action — feed every bot decision through engine validation
   in tests.
2. HeuristicBot: board evaluation (production pips, resource diversity, port
   synergy, expansion potential, blocking value), one-ply lookahead over legal
   actions.
3. MCTSBot: Information Set MCTS with determinization — sample N plausible
   worlds for hidden opponent hands/deck order consistent with observed events,
   run seeded simulations using RuleBasedBot as rollout policy, aggregate with
   UCB. Time budget per move as a parameter. Must support base module first;
   expansion support can degrade gracefully to HeuristicBot initially.

Add a benchmark harness: round-robin tournaments between tiers over 500+ seeded
games, reporting win rates. MCTSBot must beat HeuristicBot >60% and
HeuristicBot must beat RuleBasedBot >60%. Run bots in worker threads. Commit
when green and benchmarks pass.
```

## Phase 8 — Server: Auth, Lobby, Realtime Multiplayer

```text
In apps/server, implement:

- Prisma schema: users, games, game_actions (event log), lobbies, stats.
  Migrations included.
- Auth: register, login, refresh, logout, bcrypt hashing, JWT access +
  rotating refresh tokens, rate limiting on auth endpoints.
- Lobby: create/join/leave, public/private with invite codes, 2–6 seats, add
  bot players with difficulty selection, settings (target VP, modules enabled,
  turn timer), ready-check, host starts game. Lobby chat. All synced over
  Socket.IO with authenticated sockets.
- Game runtime: server-authoritative engine instance per game, Redis-backed
  state cache + event log persisted to Postgres, per-player redacted views via
  viewFor, action validation, broadcast of resulting events, turn timers with
  auto-pass/auto-discard, disconnect handling (grace period, bot takeover
  option, reconnection replays missed events), spectator mode read-only.
- Concurrency safety: serialize actions per game (single writer per game room);
  test simultaneous conflicting actions.

Integration tests with Supertest + socket.io-client covering a full multiplayer
game including a mid-game reconnect. Swagger docs for REST endpoints. Commit
when green.
```

## Phase 9 — Web PWA Frontend

```text
In apps/web, implement the React PWA:

- SVG hex board renderer driven purely by engine state: hexes, tokens, harbors,
  roads/ships, settlements/cities, robber/pirate, knight pieces. Responsive:
  desktop side-panels, mobile bottom-sheet UI with pinch-zoom/pan board.
  Read /mnt or repo docs and the frontend-design guidance if available; aim for
  an original, polished visual identity — no assets imitating existing games.
- Screens: auth, lobby browser, lobby room, game table, post-game stats,
  match history, profile.
- Game UX: legal-move highlighting (query engine for legal actions), build
  previews, trade dialog, dev/progress card hand, discard picker, dice + event
  die animation, turn timer, action log, in-game chat, toasts for events.
- Single-player mode: engine + bots run in a Web Worker entirely client-side,
  installable PWA with offline support (service worker caching app shell),
  local save/resume of games via IndexedDB.
- Multiplayer mode: Socket.IO client with optimistic UI only for local-only
  interactions; all game actions round-trip through the server.
- Playwright e2e: complete a scripted single-player game vs a RuleBasedBot,
  and a 2-browser multiplayer smoke test.

Commit when green.
```

## Phase 10 — Stats, Match History, Polish

```text
Implement:

- Post-game stats derived from the event log: dice frequency, resources
  gained/spent per player, trades, VP progression over turns, award durations.
  Chart.js visualizations on the post-game screen.
- Match history APIs with pagination/filtering, replay viewer (step through
  the event log on the board renderer).
- Player profiles: wins/losses/rating (Elo-style across game sizes).
- Achievements (define 10 sensible ones).

Tests for stat aggregation correctness against known event logs. Commit.
```

## Phase 11 — Hardening & Release

```text
Full review pass:

- Run the entire test suite and fix any flakiness.
- Security review: authz on every endpoint and socket event (players can only
  act as themselves), input validation with zod on all boundaries, no hidden
  info leaking in any payload (write a test that snapshots every socket payload
  in a full game and asserts no opponent hand contents appear).
- Load test: 100 concurrent games with bot players; profile and fix hotspots.
- Verify Docker production build, write deployment guide (Nginx, TLS, env
  vars), and a rules reference page in the app.
- Produce a technical-debt summary and prioritized backlog.

No breaking changes. Commit.
```

---

## Tips for running this with Claude Code

- One phase per session keeps context focused. If a phase stalls, split it
  ("do only the Longest Road algorithm from Phase 3").
- The two "wait for my sign-off" checkpoints (module architecture, expansion
  rule docs) are the highest-leverage review moments — read those docs carefully.
- After each phase: `git diff --stat`, skim the tests, play/poke what exists.
- If Claude Code proposes changing the coordinate scheme or module interface
  mid-project, stop and evaluate — those are load-bearing decisions.
- Realistic expectation: phases 0–3 are smooth; 5–7 will need multiple
  iterations and your rules judgment on edge cases.
