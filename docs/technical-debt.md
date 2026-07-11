# Technical Debt & Backlog

Written at the end of Phase 11. Everything below is either a deliberate
scope cut made somewhere in Phases 0–11, or a gap found during this
phase's security review / load test / Docker verification that wasn't
fixed because fixing it properly is a bigger, riskier change than a
hardening pass should make unilaterally. Ordered roughly by priority
within each section.

## High priority

### 1. `/history/:gameId` lets a participant reconstruct every opponent's hidden hand/dev-card history after the game ends

**What**: `HistoryService.getDetail` (`apps/server/src/stats/historyService.ts`)
correctly restricts access to actual participants, but then returns the
**entire raw action log** plus the game's `seed`. Because the client
replays `createGame` + `applyAction` over that log to power the replay
viewer (`apps/web/src/screens/GameDetailScreen.tsx`), and because that
replay is fully deterministic, a technically-inclined participant can
reconstruct every opponent's exact hand and dev-card contents at every
point in the game — including resources discarded on a 7 (`DiscardAction.resources`
records the exact breakdown; live play only ever reveals a count) — via
the browser's network tab or a custom API client, entirely bypassing the
UI's own redaction (`viewFor(..., user.id)`, which only governs what's
_rendered_, not what's in the HTTP response body).

**Why it matters**: this app has persistent ratings and players who face
the same opponents repeatedly in public matchmaking — post-game full
transparency isn't obviously fine the way it might be in a one-off casual
app, since it lets a player study an opponent's habits (when they discard
what, how they manage hidden dev cards) ahead of a rematch.

**Why not fixed now**: the fix is architectural, not a patch. The
replay-from-raw-actions design (chosen in Phase 10 specifically to avoid
the server serializing/transmitting N full states) is fundamentally
incompatible with hiding anything, since the client needs the _complete_
deterministic trace to replay at all. A real fix means computing and
storing (or computing on demand) a per-viewer-redacted state at every
step server-side — i.e., moving replay computation server-side, the thing
Phase 10 deliberately avoided for efficiency. That's a real design
decision, not a bug fix, and deserves its own sign-off rather than being
silently changed here.

**Possible directions**: (a) redact `DiscardAction.resources` specifically
in the stored/returned log (the smallest concrete leak) while accepting
hand-position reconstruction remains possible via production/trade
replay; (b) move to server-computed per-viewer state snapshots, likely
cached, for genuine fix; (c) explicitly decide this is acceptable
post-game behavior (many digital board games do reveal everything after
the fact) and just document it as intentional instead of a gap.

### 2. Horizontal scaling isn't safe yet

`GameRuntimeService.withLock` (`apps/server/src/game/gameRuntime.ts`) is an
**in-process** lock. A single `server` container is fully correct; two
replicas behind a load balancer are not — both could believe they're the
sole writer for the same game. Postgres's `(gameId, seq)` unique
constraint prevents silent corruption (one replica's write fails), but
there's no retry path today — that write is just dropped, an error the
client never explicitly hears about. Needs a distributed lock (Redis is
already in the stack — a natural fit) before running more than one
replica. See docs/deployment.md §5.

### 3. No hidden-info-leak regression coverage beyond one live-game test

`apps/server/src/integration/hiddenInfo.test.ts` (added this phase) proves
the _live_ `game:update` socket payload never leaks opponent hands — but
covers only one 3-player base-module game. It doesn't exercise the
expansion modules (seafarers-style ships/pirate, cities & knights'
commodities/progress cards) or the `/history` leak documented in item 1
above (which the test doesn't check at all, since it's a known, unfixed
gap, not a regression to catch).

## Medium priority

### 4. `game:action` (and most other socket events) have no rate limiting

Only `lobby:chat` is rate-limited (`apps/server/src/socket/rateLimiter.ts`).
`game:action` deliberately isn't — bot-driven clients legitimately submit
hundreds of actions/second (see the load test), so a blanket per-socket
cap either breaks that (confirmed: it did, see the git history of this
phase) or has to be so generous it stops bounding anything meaningful.
Actually closing this gap needs a smarter limiter — e.g. one that accounts
for a plausible game-turn cadence rather than raw event count, or one keyed
by whether the action actually mutated state vs. was rejected — not
something to improvise under this phase's time budget.

### 5. Swagger UI (`/docs`) has no auth gate

Anyone who can reach the API can read the full route/schema documentation.
Not a vulnerability by itself (no secrets in the schema), but worth an
explicit decision: some teams gate API docs behind auth or an internal
network in production; this app currently doesn't.

### 6. Per-player resource-type stats are visible to every participant, forever

`aggregateGameStats`'s `resourcesGainedPerPlayer`/`resourcesSpentPerPlayer`
(surfaced in `GameDetailScreen.tsx`'s "Resources Gained" chart) break down
_opponents'_ resource gains by type. This is a smaller, more clearly
intentional version of item 1 above (a designed feature, not an oversight)
but worth explicitly blessing or dialing back in the same design
conversation, since it's part of the same "how much should post-game
history reveal" question.

### 7. Prisma-backed repositories and the Docker Compose stack have never run against live infrastructure

Every phase of this project (see docs/architecture/server.md §0) was built
and tested against in-memory repository doubles because this sandbox has
no Docker daemon, Postgres, or Redis. The in-memory and Prisma
implementations share one interface and the in-memory side is fully
tested, but the Prisma side's SQL, migration, and connection-pooling
behavior is unverified. This phase's `PrismaGameRepository.appendAction`
optimization (an in-process `nextSeqByGameId` cache — see item 2, same
underlying single-process assumption) is in the same boat: logically
sound, never run against real Postgres. **First thing to do with real
infrastructure available**: `docker compose up --build`, run through a
full game, and diff behavior against the in-memory path.

## Low priority

### 8. Web production bundle exceeds Vite's 500 kB chunk-size warning

`apps/web`'s build emits one ~569 kB JS chunk (183 kB gzipped). Not broken,
just a straightforward code-splitting opportunity (dynamic `import()` for
e.g. the Chart.js-heavy `GameDetailScreen`, or `manualChunks`) if initial
load time becomes a concern.

### 9. No E2E coverage for expansion-module gameplay

`apps/web/e2e/` covers a full base-module single-player game and a
multiplayer smoke test — neither exercises seafarers-style (ships, the
pirate, exploration) or cities & knights-style (commodities, progress
cards, knights, barbarians) end-to-end through the UI. Each module has
thorough engine-level unit/integration test coverage (packages/engine);
the gap is specifically UI-level.

### 10. Achievement definitions aren't retroactively re-evaluated

If `ACHIEVEMENTS` (`apps/server/src/stats/achievements.ts`) gains a new
entry or changes an existing threshold, only _future_ games are evaluated
against the new definition — past games' stats are never re-scored. Fine
today (roster is fixed), worth remembering if the roster grows later.

### 11. MCTS bot's per-move time budget is fixed, not adaptive to table size

`MCTSBot`'s default 2s-per-move budget (packages/bots) doesn't scale down
in a full 6-player game, where a HARD-difficulty bot seat could
meaningfully slow down real-time play for the human players waiting on it.
Not measured directly in this phase's load test (which used the fast,
deterministic `RuleBasedBot` throughout — see docs/technical-debt.md's
own load-test section above); worth a dedicated latency check under a
realistic mixed-difficulty lobby before shipping HARD bots as a default
recommendation.

## Fixed this phase (kept here for traceability)

These were found and fixed during Phase 11, not left as debt — listed so
future readers of this doc know they don't need to re-discover them:

- `apps/server/Dockerfile` and `apps/web/Dockerfile` were both missing a
  `COPY packages/bots` step despite both apps depending on it at
  runtime/build-time — the server process would have failed to even
  start. CI now builds both images on every push (`.github/workflows/ci.yml`)
  specifically so this class of bug can't ship silently again.
- `docker-compose.yml` never set `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`,
  which the server throws on at startup — `docker compose up` would have
  crash-looped forever with the README's own literal instructions.
- Socket.IO event payloads had no schema validation at the wire boundary
  (`apps/server/src/socket/schemas.ts` closes this).
- `POST /lobbies/:id/join` didn't check `isPublic`, letting a private
  lobby be joined by anyone who obtained its id (bypassing the invite-code
  gate entirely) — fixed in `LobbyService.joinById`.
- `lobby:watch` had no membership check, letting any authenticated user
  watch a private lobby's state by id.
- The single-player Playwright e2e test (`apps/web/e2e/singlePlayer.spec.ts`)
  had a latent toggle race in its road-building logic that could hang the
  whole test for its full 300s timeout — fixed by reordering the check.
- `vertexAt`/`edgeBetween` (`packages/engine/src/coordinates.ts`), on the
  hottest path in the whole engine, went through a generic
  `Array.prototype.sort` + `.map().join()` for what's always exactly 2 or
  3 elements — hand-written fast paths found during the load test's
  profiling cut the 10,000-board property test's time by ~64% and raised
  the load test's throughput ~55%.
- `PrismaGameRepository.appendAction` did an extra `findFirst` query
  before every single insert — cached in-process instead (see item 7's
  caveat about this being unverified against live Postgres).
