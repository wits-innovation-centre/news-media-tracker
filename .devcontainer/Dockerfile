# syntax=docker/dockerfile:1
# Multi-stage build for the tracker Next.js web app.
# Used by docker-compose.yml (external-server profile).

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Enable corepack to use the pnpm version declared in package.json.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: build the Next.js app ───────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Build with npx next build to avoid the generate-public-cache helper script
# which requires the fast-glob dev dependency not present at runtime.
RUN npx next build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# PORT is read by `next start`; override at runtime via -e PORT=<n>.
ENV PORT=3000

# Copy only what Next.js needs to serve in production.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

# Runtime data directory – mounted as a named volume in docker-compose.
RUN mkdir -p /app/data

EXPOSE 3000
# Next.js start respects the PORT environment variable set above.
CMD ["npx", "next", "start"]
