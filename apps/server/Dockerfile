FROM node:20-slim AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/bots/package.json packages/bots/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY apps/server apps/server
RUN pnpm exec turbo run build --filter=...@baychearsbar/server

FROM node:20-slim AS runtime
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/packages/engine/package.json packages/engine/package.json
COPY --from=build /repo/packages/engine/dist packages/engine/dist
COPY --from=build /repo/packages/bots/package.json packages/bots/package.json
COPY --from=build /repo/packages/bots/dist packages/bots/dist
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
RUN pnpm install --prod --frozen-lockfile --filter=...@baychearsbar/server

# Runs as an unprivileged user — the base image's built-in "node" account, not root.
USER node
EXPOSE 3001

# Hits the app's own liveness endpoint (apps/server/src/app.ts) — no curl/wget
# in node:20-slim, so use Node's http client directly. Reads $PORT so it
# still works if that's ever overridden away from the EXPOSEd default.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
