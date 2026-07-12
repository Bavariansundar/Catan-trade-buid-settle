# BayCheArsBar

An online settlement-and-trading board game — web + mobile-PWA, 2–6 players,
single-player vs. bots, and expansion modules. See [CLAUDE.md](./CLAUDE.md)
for the full design brief and [PROMPTS.md](./PROMPTS.md) for the phased
build plan.

## Monorepo layout

```
packages/engine   pure rules engine (no IO/socket/DB deps)
packages/bots     AI opponents (depends only on engine)
apps/server       Node.js + Express + Socket.IO + Prisma + Redis
apps/web          React 18 + Vite PWA frontend
```

Managed with pnpm workspaces + Turborepo.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` or `npm install -g pnpm`)
- Docker + Docker Compose (for Postgres/Redis and containerized builds)

## Setup

```bash
pnpm install
```

## Common commands

Run from the repo root; Turborepo fans these out to every package in
dependency order.

```bash
pnpm build       # build all packages/apps
pnpm dev         # run all packages/apps in watch/dev mode
pnpm test        # run all test suites (Vitest for engine/bots/web, Jest for server)
pnpm lint        # ESLint across the monorepo
pnpm typecheck   # tsc --noEmit across the monorepo
pnpm format      # Prettier write
```

To scope a command to one package: `pnpm --filter @baychearsbar/engine test`.

## Running with Docker

```bash
cp .env.example .env   # then set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
docker compose up --build
```

This starts Postgres, Redis, the API server (port 3001), and the web app
(port 8080, served via Nginx) — see
[docs/deployment.md](./docs/deployment.md) for the full production
deployment guide, including TLS.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, typecheck,
build, and test on every push and pull request.
