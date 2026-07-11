FROM node:20-slim AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/bots/package.json packages/bots/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY apps/web apps/web
# Explicitly http://localhost:3001 by default (not empty — an empty
# VITE_API_URL bakes in relative/same-origin API calls, which is a real
# behavior change from apps/web/src/api/client.ts's own "unset" fallback,
# not the same thing). Fine for a single-host `docker compose up`, where
# the browser reaches both the web app and API via localhost. For a real
# remote deployment, set this to the API's real public origin, e.g.
# --build-arg VITE_API_URL=https://api.hexhaven.example.com — see
# docs/deployment.md, which also covers why the web app and API are
# deliberately two separate origins (the web app's own /history and
# /profile client routes would otherwise collide with the API's
# identically-named endpoints under one reverse-proxied origin).
ARG VITE_API_URL="http://localhost:3001"
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm exec turbo run build --filter=...@hexhaven/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
