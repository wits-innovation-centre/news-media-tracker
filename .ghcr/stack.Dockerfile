FROM alpine:3.20

LABEL org.opencontainers.image.title="news-media-tracker stack bundle"
LABEL org.opencontainers.image.description="Compose stack definition bundle for News Media Tracker"

WORKDIR /stack

COPY .ghcr/docker-compose.yml ./docker-compose.yml
COPY .env.example ./.env.example
