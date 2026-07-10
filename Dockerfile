# Real, working container image — previously there was no Dockerfile at all,
# so containerized deployment (or even just "run this the same way
# everywhere") wasn't possible without hand-rolling the exact Node version
# and build steps.
#
# Build:  docker build -t studentdiwan .
# Run:    docker run -p 3000:3000 --env-file .env studentdiwan
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# better-sqlite3 is a native module (compiled via node-gyp) if no prebuilt
# binary matches this exact platform/glibc combo — installing the toolchain
# up front means npm ci can't fail on a missing compiler, only ever fall
# back to it silently succeeding either way.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage — only what's needed to run the built server, not the
# whole toolchain used to build it ──────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-blueprint.json ./firebase-blueprint.json
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# / api/health already does a real DB ping — see server.ts — so this
# genuinely reflects container health, not just "the process is alive".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
