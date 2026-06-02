# syntax=docker/dockerfile:1
# Multi-stage build for the tracker Next.js web app.
# Used by docker-compose.yml (external-server profile).

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:26-bookworm-slim AS deps
WORKDIR /app
# Enable corepack to use the pnpm version declared in package.json.
RUN (command -v corepack >/dev/null 2>&1 \
    && corepack enable \
    && corepack prepare pnpm@8.15.0 --activate) \
    || npm install -g pnpm@8.15.0
# Run pnpm as the non-root node user (uid 1000) so installed files are never
# root-owned. This prevents EPERM when bin wrappers are chmod'd on hosts that
# share a bind-mounted workspace with the devcontainer.
RUN chown node:node /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace --frozen-lockfile

# ── Stage 1b: production-only dependencies ──────────────────────────────────
FROM node:26-bookworm-slim AS prod-deps
WORKDIR /app
RUN (command -v corepack >/dev/null 2>&1 \
    && corepack enable \
    && corepack prepare pnpm@8.15.0 --activate) \
    || npm install -g pnpm@8.15.0
RUN chown node:node /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace --prod --frozen-lockfile

# ── Stage 2: build the Next.js app ───────────────────────────────────────────
FROM node:26-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
RUN chown node:node /app
USER node
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
# Build with npx next build to avoid the generate-public-cache helper script
# which requires the fast-glob dev dependency not present at runtime.
RUN ./node_modules/.bin/next build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:26-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# PORT is read by `next start`; override at runtime via -e PORT=<n>.
ENV PORT=3000

# Runtime data directory – mounted as a named volume in docker-compose.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# Copy only what Next.js needs to serve in production.
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000
# Next.js start respects the PORT environment variable set above.
ENTRYPOINT ["./node_modules/.bin/next", "start"]

# ── Stage 4: seeder runner (dev profile) ─────────────────────────────────────
# Contains full dependencies and source so the sqld seed script can run
# without host bind mounts or ad-hoc installs.
FROM node:26-bookworm-slim AS seeder
WORKDIR /app
RUN ((command -v corepack >/dev/null 2>&1 \
    && corepack enable \
    && corepack prepare pnpm@8.15.0 --activate) \
    || npm install -g pnpm@8.15.0) \
    && chown node:node /app
USER node

# Reuse fully resolved dependency tree from deps stage for deterministic runs.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

ENTRYPOINT ["./node_modules/.bin/tsx", "scripts/setup-sqld.ts"]

# Keep the production web runner as the default final stage for plain
# `docker build` / GHCR publishing when no --target is specified.
FROM runner AS default-image
