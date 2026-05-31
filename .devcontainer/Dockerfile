FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends docker.io docker-compose ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && corepack prepare pnpm@8 --activate \
    && mkdir -p /workspace /pnpm/store /home/node/.ssh \
    && chown -R node:node /workspace /pnpm /home/node/.ssh

WORKDIR /workspace
USER node