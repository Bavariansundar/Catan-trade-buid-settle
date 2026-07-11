# Deployment Guide

Written for Phase 11. Covers running the production Docker images, required
environment variables, and TLS. **Not live-verified** — see the note at the
end of this doc.

## 1. Architecture

```
                     ┌──────────────────────────────┐
   browser  ──TLS──▶ │  hexhaven.example.com          │
                     │  (Nginx/Caddy → web container) │
                     └────────────────┬────────────────┘
                                      │ :8080
                     ┌────────────────▼────────────────┐
                     │  web container (Nginx)            │
                     │  serves the built SPA only          │
                     └───────────────────────────────────┘

                     ┌──────────────────────────────┐
   browser  ──TLS──▶ │  api.hexhaven.example.com       │
                     │  (Nginx/Caddy → server container)│
                     └────────────────┬────────────────┘
                                      │ :3001
                     ┌────────────────▼────────────────┐
                     │  server container                 │
                     │  Express + Socket.IO               │
                     └────┬────────────────────────┬─────┘
                          │                        │
                   ┌──────▼──────┐          ┌──────▼──────┐
                   │  postgres    │          │  redis       │
                   │  (loopback-  │          │  (loopback-  │
                   │   only port) │          │   only port) │
                   └─────────────┘          └─────────────┘
```

The web app and API are **deliberately two separate origins**, not one
reverse-proxied origin. That was the first thing tried while writing this
guide and it doesn't work: the web app's own client-side routes
`/history` and `/profile` (React Router, see `apps/web/src/router.tsx`)
are identically named to the API's `/history` and `/profile` REST
endpoints. Routing both through one origin means a browser navigating
directly to (or refreshing) `https://hexhaven.example.com/history` would
hit whichever side owns that path at the reverse proxy — either it
correctly serves the SPA shell and the API becomes unreachable at that
path, or it hits the API's JSON endpoint instead of the SPA, breaking
direct navigation/refresh entirely. Two origins sidesteps this without
touching any application code or its tests. This does mean the API needs
its own CORS configuration (`CORS_ORIGIN`) — see below.

`postgres` and `redis` publish their ports bound to `127.0.0.1` only (not
`0.0.0.0`) — reachable from a `pnpm dev` process running directly on the
same host (see README's "Running with Docker"), but not from the network.

## 2. Required environment variables

Copy `.env.example` to `.env` before `docker compose up --build`. Compose
reads `.env` from the same directory as `docker-compose.yml` automatically.

| Variable             | Required | Default                 | Notes                                                                                                                                                                                                        |
| -------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_ACCESS_SECRET`  | **yes**  | none                    | `docker compose up` fails fast with a clear error if unset. Rotating it logs out every access token.                                                                                                         |
| `JWT_REFRESH_SECRET` | **yes**  | none                    | Same as above, for refresh tokens.                                                                                                                                                                           |
| `POSTGRES_PASSWORD`  | no       | `hexhaven`              | Change for any deployment reachable outside your own machine.                                                                                                                                                |
| `CORS_ORIGIN`        | no       | `*`                     | Comma-separated allowed origin(s) for the API — set to the _web app's_ origin (e.g. `https://hexhaven.example.com`) in production.                                                                           |
| `VITE_API_URL`       | no       | `http://localhost:3001` | The API's public origin as the browser will reach it — set to the API's real origin (e.g. `https://api.hexhaven.example.com`) for any remote deployment. Baked in at build time (Vite), not read at runtime. |

`apps/server/.env.example` is a separate file for the "run `apps/server`
directly on the host, Postgres/Redis via Docker" workflow — it documents
`DATABASE_URL`/`REDIS_URL`/`PORT` too, which the root `.env` doesn't need
(docker-compose sets those itself, pointing at the `postgres`/`redis`
service names).

## 3. Running it

```bash
cp .env.example .env
# edit .env: at minimum, set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
# (openssl rand -hex 32 works well for both)

docker compose up --build
```

This starts Postgres, Redis, the API server (port 3001), and the web app
(port 8080). Out of the box, on a single host, both are reachable at
`localhost` and everything works with no further configuration — the
`VITE_API_URL`/`CORS_ORIGIN` overrides only matter once the two are on
genuinely different public origins.

**Database migrations**: this compose file does not run `prisma migrate
deploy` automatically. Run it once against the running `postgres` service
before first use (and after pulling any schema change):

```bash
docker compose exec server sh -c "cd apps/server && npx prisma migrate deploy"
```

(`prisma migrate deploy` — not `migrate dev` — is the non-interactive,
production-safe command; see docs/architecture/server.md §1.)

## 4. TLS

Neither the `web` nor `server` container terminates TLS itself — cert
issuance needs real DNS validation, which nothing in this repo can safely
assume. Put a TLS-terminating reverse proxy in front of each container
instead, one per public origin (§1). Two common options:

**Option A — Caddy** (simplest; automatic Let's Encrypt):

```
# Caddyfile
hexhaven.example.com {
    reverse_proxy localhost:8080
}
api.hexhaven.example.com {
    reverse_proxy localhost:3001
}
```

**Option B — host Nginx + Certbot** (repeat this block per origin, once for
`hexhaven.example.com` → `localhost:8080`, once for
`api.hexhaven.example.com` → `localhost:3001`):

```nginx
server {
    listen 443 ssl;
    server_name api.hexhaven.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.hexhaven.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.hexhaven.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # needed for Socket.IO's websocket upgrade
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name api.hexhaven.example.com;
    location / { return 301 https://$host$request_uri; }
}
```

```bash
sudo certbot --nginx -d hexhaven.example.com -d api.hexhaven.example.com
```

Once both origins have real domains, set (in `.env`):

```
VITE_API_URL=https://api.hexhaven.example.com
CORS_ORIGIN=https://hexhaven.example.com
```

## 5. Known scaling limit

`GameRuntimeService` serializes all writes to a given game with an
**in-process** lock (`withLock` in `apps/server/src/game/gameRuntime.ts`).
That's correct for a single `server` container. Running more than one
`server` replica behind a load balancer is not currently safe — two
replicas could both think they're the sole writer for the same game. The
Postgres `(gameId, seq)` unique constraint catches the resulting conflict
(so games can't silently corrupt), but a replica that loses that race
currently has no retry path — the write is just dropped. Horizontal scaling
needs a distributed lock (e.g. a Redis-based one, since Redis is already in
the stack) before adding a second replica. See docs/technical-debt.md.

## 6. What's not verified

Consistent with every other phase of this project (see
docs/architecture/server.md §0): **this sandbox has no Docker daemon**, so
none of `docker compose up --build`, the TLS reverse-proxy configs, or the
migration command above have been run against real containers. Everything
in this doc was verified by direct inspection instead:

- `apps/server/Dockerfile` and `apps/web/Dockerfile` were both missing a
  `COPY packages/bots` step despite `apps/server` and `apps/web` both
  depending on `@hexhaven/bots` at runtime/build-time respectively — fixed
  in this phase (confirmed via `grep` that both actually import from it,
  not just declare it as an unused dependency; `apps/server/src/game/
gameRuntime.ts` and `turnAutomation.ts` import it unconditionally, so
  the server process would fail to even start without this fix).
- `docker-compose.yml`'s `server` service never set `JWT_ACCESS_SECRET`/
  `JWT_REFRESH_SECRET`, which `apps/server/src/config.ts`'s `requireEnv`
  throws on at startup — fixed with the `${VAR:?message}` pattern above.
- A same-origin reverse-proxy architecture (API and web app behind one
  Nginx) was tried first and reverted — see §1 — after finding it would
  have broken direct navigation to `/history` and `/profile`.
- The YAML syntax of `docker-compose.yml` was validated with a YAML parser
  (not with `docker compose config`, which needs the Docker CLI).

If you have Docker available, `docker compose up --build` (after copying
`.env.example` to `.env`) is the first thing to run before trusting any of
the above.
