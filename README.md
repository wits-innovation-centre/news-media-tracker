# app.news-media-tracker

Tracker application repository.

## Roadmap Snapshot (next phase)

- Active implementation focus remains `3.2.0` (offline sync bridge and single-user deployment readiness).
- Next phase target is `3.3.x` (sync governance and controlled sharing).
- `3.3.x` includes a dedicated UI lane:
  - `[3.3.x][06-ui-sync-implementation]` UI/UX implementarian lane aligned to Stitch designs.
  - Scope: in-place `Form | Graph` workspace mode, Event Ledger alignment, and Connected Graph integration patterns.
  - Constraint: lane owns UI shell/components only; schema/permission engines stay in backend lanes.
- Conductor lane remains integration governance (`[3.3.x][00-conductor]`) and should not absorb feature implementation unless the phase is explicitly re-contracted.

Owned surfaces:

- Next.js workbench app
- Electron shell and preload runtime
- Tracker UI components, contracts, and local data access
- Application build and packaging configuration

Typical commands:

- `npm install --legacy-peer-deps`
- `npm run dev`
- `npm run start`
- `npm run test`

## Devcontainer ownership-safe dependency mounts

The workspace-level devcontainer configuration now isolates dependency paths
from the source bind mount:

- `node_modules` is mounted as a Docker named volume.
- workspace root `node_modules` is mounted as a Docker named volume.
- pnpm store is mounted as a Docker named volume.
- container user UID/GID is synchronized to the host user.

This avoids expensive recursive ownership repair on bind-mounted dependency
trees and prevents most `EACCES` ownership drift loops.

Configuration files:

- `/workspace/.devcontainer/apps.news-media-tracker/devcontainer.json`
- `/workspace/.devcontainer/devcontainer.json`

How to apply:

1. Run `Dev Containers: Rebuild and Reopen in Container` in VS Code.
2. Let the post-create install complete once.
3. Use `pnpm`/`npm` commands without `sudo` inside the container.

If you need a clean dependency reset, remove the named volumes and rebuild:

```bash
docker volume rm wits-research-platform-root-node-modules news-media-tracker-node-modules wits-research-platform-pnpm-store
```

## Docker Deployment (External Server Profile)

The `external-server` Docker Compose profile brings up a fully self-hosted
deployment of the tracker in a single command. It includes:

| Service        | Image / Build                                | Default port | Description                      |
| -------------- | -------------------------------------------- | ------------ | -------------------------------- |
| `tracker-sqld` | `ghcr.io/tursodatabase/libsql-server:latest` | `8080`       | LibSQL/sqld sync-target database |
| `tracker-app`  | Built from `.ghcr/Dockerfile`                | `3000`       | Next.js tracker web UI and API   |

### One-command bring-up

```bash
# 1. Copy the example env file and review the defaults (no edits needed for dev)
cp .env.example .env

# 2. Start the external server stack (builds tracker-app on first run)
docker compose --profile external-server up -d

# 3. Open the tracker UI
open http://localhost:3000
```

The sqld database is immediately reachable at `http://localhost:8080`.

## Docker Dev Profile (Auto-seeded)

Use the `dev` profile when you want test-ready data without manual capture.

```bash
# Start sqld + app + one-shot seeder
npm run dev.stack.up

# Open the app
open http://localhost:3000
```

The dev stack uses a dedicated compose project name (`nmt-dev`) to avoid
colliding with stale default networks from other compose runs.
It also builds local images on startup, so you do not need GHCR login just to
run the dev profile.
The dev profile uses isolated host ports to avoid clashes with other stacks:
`http://localhost:13000` for the app and `http://localhost:18080` for sqld.

The `seed-sqld` container runs automatically on startup and exits after seeding.
Seed data includes intentional duplicate victim/perpetrator records so you can
test merge and alias-promotion flows immediately.

```bash
# Stop and reset dev volumes
npm run dev.stack.down
```

If you only want seeded data quickly (without building/running the app
container), use:

```bash
npm run dev.seed.up
```

### Local Server Profile (for dev containers)

If your dev container already has PostgreSQL but you also need a reachable app
server for this project, start the `local-server` profile:

```bash
docker compose --profile local-server up -d
```

What it starts:

| Service        | Default port | Purpose                             |
| -------------- | ------------ | ----------------------------------- |
| `sqld`         | `8080`       | LibSQL sync-target used by this app |
| `local-server` | `3001`       | Container-local tracker app server  |

Container/network endpoints:

- From host machine: `http://localhost:3001`
- From another compose service on the same network: `http://local-server:3000`

To stop it:

```bash
docker compose --profile local-server down
```

### Connecting the tracker app to the hosted sqld instance

After the stack is running, open **Settings → Sync** in the tracker UI and set
the remote endpoint to `http://localhost:8080` (or the server's public URL/IP).
Leave the auth token empty for local/private-network deployments. For
internet-facing deployments, set `SQLD_AUTH_JWT_KEY` and `DATABASE_AUTH_TOKEN`
in `.env` before starting the stack.

#### Generating auth credentials for internet-facing deployments

```bash
# 1. Generate a random JWT signing key and add it to .env
SQLD_AUTH_JWT_KEY=$(openssl rand -base64 32)
echo "SQLD_AUTH_JWT_KEY=${SQLD_AUTH_JWT_KEY}" >> .env

# 2. Generate a JWT token accepted by your sqld auth configuration.
#    The example below is HS256 (HMAC) and may not match all deployments.
#    Using the `jwt` CLI (npm install -g jsonwebtoken-cli) as an example:
#    jwt sign '{"sub":"app"}' "${SQLD_AUTH_JWT_KEY}"
#
#    Alternatively, generate a HS256 token via this Node.js example snippet:
node -e "
const crypto = require('crypto');
const key = process.env.SQLD_AUTH_JWT_KEY || '${SQLD_AUTH_JWT_KEY}';
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({sub:'tracker-app',iat:Math.floor(Date.now()/1000)})).toString('base64url');
const sig = crypto.createHmac('sha256', key).update(header+'.'+payload).digest('base64url');
console.log('DATABASE_AUTH_TOKEN='+header+'.'+payload+'.'+sig);
" >> .env

# 3. Restart the stack to apply the new credentials
docker compose --profile external-server down
docker compose --profile external-server up -d
```

### Persistent volumes

Docker named volumes provide durable storage across container restarts and
upgrades:

| Volume                      | Stores                                        |
| --------------------------- | --------------------------------------------- |
| `tracker_tracker-sqld-data` | sqld WAL and database files (`/var/lib/sqld`) |
| `tracker_tracker-app-data`  | Server-side local SQLite data (`/app/data`)   |

Inspect a volume's host path:

```bash
docker volume inspect tracker_tracker-sqld-data
```

Back up the sqld volume:

```bash
docker run --rm \
  -v tracker_tracker-sqld-data:/data \
  -v "$(pwd)/backup":/backup \
  busybox tar czf /backup/sqld-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Stopping and restarting the stack

```bash
# Stop (volumes are preserved)
docker compose --profile external-server down

# Stop and delete volumes (destructive – removes all data)
docker compose --profile external-server down -v

# Rebuild tracker-app after code changes
docker compose --profile external-server build tracker-app
docker compose --profile external-server up -d
```

### Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable                   | Default                 | Description                                   |
| -------------------------- | ----------------------- | --------------------------------------------- |
| `SQLD_AUTH_JWT_KEY`        | _(empty)_               | JWT key for sqld auth; leave empty to disable |
| `DATABASE_AUTH_TOKEN`      | _(empty)_               | Bearer token the app sends to sqld            |
| `SQLD_HTTP_PORT`           | `8080`                  | Host port for the sqld HTTP endpoint          |
| `APP_PORT`                 | `3000`                  | Host port for the tracker web UI              |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Public base URL for the app                   |

## GHCR Minimal Deploy (Prebuilt App Container)

Use this when you want the smallest operational path: pull one app image from
GHCR and run it directly.

### 1) Enable package publishing permissions in GitHub

- Workflow file: [`.github/workflows/publish-ghcr.yml`](.github/workflows/publish-ghcr.yml)
- It uses `GITHUB_TOKEN` with `packages: write` and pushes to:
  - `ghcr.io/<owner>/<repo>:<tag>`
  - `ghcr.io/<owner>/<repo>:latest` (default branch only)

No extra PAT is required for workflow publishing inside this repository.

### 2) Publish an image

Trigger the workflow manually (**Actions → publish-ghcr → Run workflow**) or
push a version tag:

```bash
git tag v3.1.2
git push origin v3.1.2
```

### 3) Deploy by pulling from GHCR

GHCR compose in [`.ghcr/docker-compose.yml`](.ghcr/docker-compose.yml) now starts
both services required for a full runtime:

- `app` (tracker web/API)
- `sqld` (remote sync target)

Run:

```bash
docker compose -f .ghcr/docker-compose.yml pull
docker compose -f .ghcr/docker-compose.yml up -d
```

Open `http://localhost:3000`.

sqld is available at `http://localhost:${SQLD_HTTP_PORT:-8080}`.

### Dev Profile With Seeded Data

For local testing without manual data capture, use the `dev` profile. It starts
`sqld` and `app`, then runs a one-shot `seed-sqld` job that applies migrations
and inserts idempotent sample data.

```bash
docker compose -f .ghcr/docker-compose.yml --profile dev up -d
```

Re-run seeding at any time:

```bash
docker compose -f .ghcr/docker-compose.yml --profile dev run --rm seed-sqld
```

If you already have an external sqld server and do not want a bundled one,
start only the app service:

```bash
docker compose -f .ghcr/docker-compose.yml up -d app
```

### 4) Pull/run without compose (single command)

```bash
docker run -d --name news-media-tracker \
  -p 3000:3000 \
  ghcr.io/wits-research-office-development/news-media-tracker:latest
```
