FROM node:20-slim AS base
WORKDIR /repo
RUN corepack enable
# Prisma's generated query engine needs OpenSSL at both `prisma generate`
# time (which runs as a postinstall hook on every `pnpm install`, deps stage
# included) and at runtime — node:20-slim doesn't ship it, and without this
# Prisma silently guesses "openssl-1.1.x" and downloads the wrong engine
# binary for this (OpenSSL 3.x) base image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/bots/package.json packages/bots/package.json
COPY apps/server/package.json apps/server/package.json
# The postinstall hook below runs `prisma generate`, which needs the schema
# present — package.json alone isn't enough.
COPY apps/server/prisma apps/server/prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY apps/server apps/server
RUN pnpm exec turbo run build --filter=...@baychearsbar/server

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/packages/engine/package.json packages/engine/package.json
COPY --from=build /repo/packages/engine/dist packages/engine/dist
COPY --from=build /repo/packages/bots/package.json packages/bots/package.json
COPY --from=build /repo/packages/bots/dist packages/bots/dist
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/prisma apps/server/prisma
COPY --from=build /repo/apps/server/dist apps/server/dist
# Deliberately NOT --filter=...@baychearsbar/server here: with a filter,
# pnpm only fully links node_modules (incl. nested workspace-to-workspace
# links) for packages it treats as install targets, not for packages merely
# pulled in as the target's dependencies — so packages/bots never got its
# own node_modules/@baychearsbar/engine symlink, and its compiled output
# (imported by the server at runtime) threw ERR_MODULE_NOT_FOUND even
# though the package was right there on disk. Unfiltered is also correct
# here: this stage's context only ever has server/bots/engine's
# package.json files (apps/web was never copied in), so it can't install
# anything broader anyway.
#
# node_modules aren't carried over between stages, so this reinstall also
# re-triggers the `prisma generate` postinstall — same reason the schema is
# copied above.
RUN pnpm install --prod --frozen-lockfile

# Runs as an unprivileged user — the base image's built-in "node" account, not root.
USER node
EXPOSE 3001

# Hits the app's own liveness endpoint (apps/server/src/app.ts) — no curl/wget
# in node:20-slim, so use Node's http client directly. Reads $PORT so it
# still works if that's ever overridden away from the EXPOSEd default.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
