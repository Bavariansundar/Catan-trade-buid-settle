# Server Architecture — Auth, Lobby, Realtime Multiplayer

Design for Phase 8 (`apps/server`). Per CLAUDE.md this is a load-bearing
architectural decision (persistent schema + auth security model + realtime
protocol) and needs sign-off before implementation, the same checkpoint
category as Phase 1's coordinate scheme and Phase 4's module architecture.

## 0. Environment constraint (read this first)

**No Docker, Postgres, or Redis are available in this sandboxed session** —
verified directly (`docker`, `psql`, `redis-cli` all absent). This shapes
the design in one deliberate way: every piece of business logic talks to a
small **injectable interface** (`UserRepository`, `GameStateCache`, ...)
rather than importing `PrismaClient`/`ioredis` directly. Production code
gets a real Postgres/Redis-backed implementation; tests get an in-memory
implementation of the _same interface_. This means:

- Full test coverage (auth, lobby, game runtime, reconnection, concurrency)
  runs without any live database — the same interface is exercised either
  way, so the tests are real, not a mockery of the logic.
- The Prisma **schema and migration SQL** are still fully written and
  committed (schema validation and migration-diffing don't need a live DB —
  see §1).
- What I _can't_ do here: run `docker-compose up` and confirm the real
  Postgres/Redis implementations against live infra, or exercise the
  `Dockerfile`/compose wiring end-to-end. That verification is on you,
  the same way Phase 0's Docker setup was never live-tested in this
  environment. I'll call this out again in the final summary.

## 1. Prisma schema

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  displayName  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  refreshTokens RefreshToken[]
  hostedLobbies Lobby[]        @relation("LobbyHost")
  lobbySeats    LobbySeat[]
  stats         PlayerStats?
}

// Opaque random tokens, stored only as a hash — rotation chain for reuse detection (see §2).
model RefreshToken {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash     String    @unique
  expiresAt     DateTime
  revokedAt     DateTime?
  replacedById  String?   @unique
  createdAt     DateTime  @default(now())

  @@index([userId])
}

model Lobby {
  id                 String    @id @default(uuid())
  code               String?   @unique // present only when !isPublic
  isPublic           Boolean   @default(true)
  hostUserId         String
  host               User      @relation("LobbyHost", fields: [hostUserId], references: [id])
  status             LobbyStatus @default(WAITING)
  targetVictoryPoints Int      @default(10)
  enabledModuleIds   String[]  // e.g. ["five-six-players"], ["seafarers-style:twin-isles"]
  turnTimerSeconds   Int       @default(120)
  createdAt          DateTime  @default(now())

  seats LobbySeat[]
  game  Game?
}

enum LobbyStatus {
  WAITING
  STARTED
  CLOSED
}

model LobbySeat {
  id            String   @id @default(uuid())
  lobbyId       String
  lobby         Lobby    @relation(fields: [lobbyId], references: [id], onDelete: Cascade)
  seatIndex     Int      // 0-5
  userId        String?  // null => bot seat
  user          User?    @relation(fields: [userId], references: [id])
  botDifficulty BotDifficulty?
  isReady       Boolean  @default(false)

  @@unique([lobbyId, seatIndex])
}

enum BotDifficulty {
  EASY   // RuleBasedBot
  MEDIUM // HeuristicBot
  HARD   // MCTSBot
}

model Game {
  id        String    @id @default(uuid())
  lobbyId   String    @unique
  lobby     Lobby     @relation(fields: [lobbyId], references: [id])
  seed      String
  configJson Json     // resolved GameConfig + module ids + seat->playerId mapping, frozen at start
  status    GameStatus @default(ACTIVE)
  winnerId  String?
  startedAt DateTime  @default(now())
  endedAt   DateTime?

  actions GameAction[]
}

enum GameStatus {
  ACTIVE
  ENDED
  ABANDONED
}

// The event-sourced action log — the *only* durable source of truth for game
// state (see CLAUDE.md's event sourcing principle). GameState itself is
// never persisted; it's always either cached (Redis) or rebuilt by
// replaying this table through the engine.
model GameAction {
  id        String   @id @default(uuid())
  gameId    String
  game      Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  seq       Int      // monotonic per game, starting at 0
  playerId  String   // engine PlayerId (seat-assigned, not a User id — bots have one too)
  actionJson Json    // the engine Action, verbatim
  createdAt DateTime @default(now())

  @@unique([gameId, seq])
}

model PlayerStats {
  userId      String @id
  user        User   @relation(fields: [userId], references: [id])
  gamesPlayed Int    @default(0)
  gamesWon    Int    @default(0)
  updatedAt   DateTime @updatedAt
}
```

Notes:

- `GameAction.actionJson` stores the engine's own `Action` type verbatim
  (already JSON-safe — the engine's `Action`/`GameEvent` unions are plain
  data, see docs/architecture/modules.md). Replay = `createGame` from
  `seed`/`configJson`, then fold `applyAction` over `actions` in `seq`
  order — exactly CLAUDE.md's event-sourcing principle, and it's also
  exactly how a reconnecting client catches up (§4).
- `Lobby.enabledModuleIds` deliberately mirrors the engine's own module
  `id` strings (`RuleModule.id`) — the lobby doesn't reinvent a module
  registry, it just records which of the engine's own modules the server
  should pass to `createGame`/`applyAction` for this game. A seafarers
  scenario is `"seafarers-style:<scenario-id>"`, matching
  `createSeafarersModule(scenario).id`.
- No separate `GameEvent` table — events are derived, not stored (avoids a
  second source of truth). A reconnecting client gets replayed _actions_
  fed back through the engine, which regenerates the same events
  deterministically (same seed, same RNG steps).

## 2. Auth

- **Passwords**: bcrypt, cost factor **12** _(proposal)_.
- **Access token**: JWT (HS256), short-lived — **15 minutes** _(proposal)_.
  Payload: `{ sub: userId, displayName }`. Verified on every REST call
  (middleware) and on Socket.IO handshake (§3).
- **Refresh token**: an opaque random 256-bit token (not a JWT — no reason
  to make it inspectable), stored **hashed** (SHA-256) in `RefreshToken`,
  TTL **30 days** _(proposal)_. Rotation: every `/auth/refresh` call issues
  a new refresh token and marks the old one `revokedAt` +
  `replacedById`, forming a chain. If a **revoked** token is ever presented
  again (replay of a stolen/leaked token), the entire chain from that
  token forward is revoked and the caller must log in again — standard
  rotation-with-reuse-detection.
- **Endpoints**: `POST /auth/register`, `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout` (revokes the presented refresh
  token). Rate limiting via `express-rate-limit`: **10 requests / 15 min
  per IP** on register/login, **20 / 15 min** on refresh _(proposal)_.
- **Injectable repository**: `UserRepository` (`create`, `findByEmail`,
  `findById`) and `RefreshTokenRepository` (`create`, `findByHash`,
  `revoke`, `revokeChainFrom`) — Prisma-backed in production, in-memory
  `Map`-backed in tests. Auth business logic (`AuthService`) only ever
  calls these interfaces.

## 3. Lobby + Socket.IO

- **REST** (durable resource operations): `POST /lobbies` (create),
  `GET /lobbies` (list public lobbies), `POST /lobbies/:id/join`,
  `POST /lobbies/join-by-code`. Returns the lobby id/code; the client then
  joins the corresponding Socket.IO room for live state.
- **Socket.IO** (live sync, per the brief): `lobby:leave`,
  `lobby:setReady`, `lobby:addBot` `{seatIndex, difficulty}`,
  `lobby:updateSettings` (host-only: target VP, module ids, turn timer),
  `lobby:chat`, `lobby:start` (host-only, requires every human seat ready
  and ≥2 total seats filled). Server broadcasts `lobby:state` (full lobby
  snapshot) after every change — simplest correct approach; a lobby's
  state is tiny, no need for incremental diffs.
- **Socket auth**: JWT access token passed in the Socket.IO handshake
  `auth` payload, verified by a connection middleware _before_ the
  connection is accepted (`socket.data.userId` set from the verified
  token; never trust a client-supplied user id in any event payload).
- **Rooms**: `lobby:{lobbyId}` while waiting; on start, everyone (and any
  spectators) move to `game:{gameId}`. A socket's room membership is the
  server's only notion of "what this connection may see" — spectators are
  simply sockets in `game:{gameId}` flagged `socket.data.spectator = true`
  server-side (§4 covers what they receive).

## 4. Game runtime

- **On lobby start**: server resolves the active `RuleModule[]` from
  `enabledModuleIds`, calls the engine's `createGame`, persists a `Game`
  row (`seed`, `configJson`), and caches the initial `GameState` in Redis
  (§4a). Bot seats are assigned a `RuleBasedBot`/`HeuristicBot`/`MCTSBot`
  instance from `packages/bots` per their `botDifficulty` — reused
  directly, not reimplemented (see also disconnect handling below).
- **Every action** (`game:action` socket event):
  1. Acquire this game's serialization lock (§5).
  2. Load `GameState` from Redis (rebuild from the Postgres `GameAction`
     log on a cache miss — the log is authoritative, the cache is just an
     optimization).
  3. `applyAction(modules, state, action)`. On `RuleError`, emit
     `game:actionRejected` to the sender only (never broadcast a
     rejection).
  4. On success: persist the `GameAction` row (`seq` = previous max + 1,
     enforced by the DB unique constraint as a belt-and-suspenders check
     against the in-process lock), update the Redis cache, and publish the
     new state + events on a Redis pub/sub channel
     (`game:{gameId}:events`) — see §4b for why pub/sub, not just a direct
     broadcast.
  5. Every subscriber (this server instance's socket.io, and any other
     instance in a horizontally-scaled deployment) emits `game:events` to
     each socket in `game:{gameId}` with **that socket's own redacted
     view**: `viewFor(modules, state, socket.data.userId)` for a player,
     or a fully-neutral view (every hand redacted, including a
     "spectating" flag) for a spectator. This is a per-socket emit, not a
     single `io.to(room).emit(...)` — hidden information differs per
     recipient.
- **Turn timers**: a server-side timer keyed by `gameId`, reset every time
  the acting player changes (`currentPlayerIndex` changes, or a phase
  requiring a specific player's input starts/ends). On expiry: auto-resolve
  via a `RuleBasedBot` instance running _as_ the timed-out player for
  exactly one decision (`ROLL_DICE` if idle, `sensibleDiscard` if a discard
  is owed, `END_TURN` otherwise) — reusing `packages/bots`, not
  reimplementing "sensible defaults" a second time.
- **Disconnect handling**: on socket disconnect, start a **30-second grace
  period** _(proposal)_ before flagging that seat for bot takeover. If the
  same `userId` reconnects (a new socket, same `userId` from a verified
  JWT) within the grace period, no takeover happens and the turn timer is
  untouched. After the grace period, subsequent decisions for that seat
  are answered by a `RuleBasedBot` (a safe, fast default — not the
  player's chosen bot difficulty, since we don't want to suddenly make a
  disconnected human "hard mode") until they reconnect, at which point
  control reverts to them immediately (mid-turn is fine — bots and humans
  share the same `Action` interface, there's no hand-off state beyond
  "whose decision is it").
- **Reconnection replay**: on reconnect, the server sends the socket (a)
  their current `viewFor` snapshot and (b) every `GameAction` since the
  `seq` the client last acknowledged (tracked client-side; server also
  caps this to "last 200 actions" and falls back to snapshot-only if a
  client claims a `seq` older than that — avoids unbounded replay for a
  client that's been offline for days), replayed through the engine so
  the client can animate catch-up exactly like the brief asks
  ("reconnection replays missed events").
- **Spectator mode**: joins `game:{gameId}` with `socket.data.spectator =
true`; receives the neutral view only, and the server rejects any
  `game:action` from a spectator socket outright (`NOT_A_PLAYER`,
  distinguished from the engine's own `RuleError` codes).

### 4a. Redis state cache

Key `game:{gameId}:state` → the `GameState` JSON. `GameState` uses
`ReadonlyMap`/`ReadonlySet` throughout (see docs/architecture/modules.md,
docs/rules/*.md) — plain `JSON.stringify` doesn't round-trip those, so a
small `serializeGameState`/`deserializeGameState` pair converts every
Map/Set field to/from arrays. This pair is intentionally the _only_ place
in the server that knows GameState's exact shape beyond what the engine's
own exported types already describe — everything else goes through the
engine's own functions.

### 4b. Why Redis pub/sub, not just a direct Socket.IO broadcast

CLAUDE.md's tech stack names Redis explicitly for "game state cache +
pub/sub," which only matters once there's more than one server process
(horizontal scaling — a socket connected to instance A needs to hear about
an action applied by instance B). This phase runs (and is tested as) a
single instance, where pub/sub is a same-process round-trip and behaves
identically to a direct broadcast — but wiring it as pub/sub _now_ means
scaling out later is a deployment change, not a rewrite. If you'd rather
skip this for a single-instance MVP and add it when it's actually needed,
that's a reasonable simplification to make instead — see open questions.

## 5. Concurrency safety

Per-`gameId` **in-process async mutex**: a `Map<gameId, Promise<void>>`
where handling an action chains onto the existing promise for that game
(`queue = queue.then(() => handle(action))`), guaranteeing single-writer
ordering per game regardless of how many socket events arrive
concurrently. This is sufficient for a single server instance (this
phase's scope); a horizontally-scaled deployment would need a distributed
lock (e.g. a Redis-based one) instead — noted as a follow-on, not solved
here, consistent with §4b's single-instance scope for this phase.

Test plan for this specifically: fire two conflicting actions (e.g. two
players both trying to move the robber) at the server "simultaneously"
(no `await` between the two `socket.emit` calls in the test) and assert
exactly one succeeds and the game's `GameAction` log has no gaps/duplicate
`seq` values.

## 6. Testing strategy given §0's constraint

- **Unit/service tests**: `AuthService`, lobby service, game runtime
  service — all against the in-memory repository/cache implementations.
- **Supertest**: REST endpoints (`/auth/*`, `/lobbies/*`) against a real
  Express app instance with the in-memory repositories injected.
- **socket.io-client**: a real Socket.IO server bound to an ephemeral local
  port (no Docker needed — this is just local process networking), real
  client connections, covering lobby sync, game action flow, a simulated
  disconnect + reconnect with replay, and the concurrency test from §5.
- **Prisma schema**: validated via `prisma validate` / `prisma format`
  (no DB connection required); the initial migration's SQL is generated
  via `prisma migrate diff --from-empty --to-schema-datamodel schema.prisma
--script`, which also doesn't require a live database — it diffs against
  an empty schema, not a live one.
- **Swagger**: `swagger-jsdoc` + `swagger-ui-express` generating docs from
  JSDoc comments on the REST route handlers, served at `/docs`.

## 7. Open questions for sign-off

1. Numeric proposals: bcrypt cost 12, access token 15 min, refresh token
   30 days, rate limits (10/15min register+login, 20/15min refresh), turn
   timer default 120s (lobby-configurable), disconnect grace period 30s.
2. Redis pub/sub now (§4b) vs. deferring it and broadcasting directly
   until horizontal scaling is actually needed.
3. Auto-timeout/disconnect decisions always use `RuleBasedBot` (fast,
   simple, predictable) rather than the seat's own configured bot
   difficulty for a _human_ seat that timed out/disconnected — confirming
   that's the right default rather than, say, doing nothing until
   reconnect (which would stall the whole table).
4. `enabledModuleIds` as a flat string array on `Lobby`, mirroring the
   engine's own `RuleModule.id` strings directly, rather than a more
   structured lobby-side module-config concept — confirming this
   "the lobby just names which engine modules to pass through" framing is
   right rather than something richer.
