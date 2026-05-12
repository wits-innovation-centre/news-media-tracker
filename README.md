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

## Docker Deployment (External Server Profile)

The `external-server` Docker Compose profile brings up a fully self-hosted
deployment of the tracker in a single command. It includes:

| Service | Image / Build | Default port | Description |
|---|---|---|---|
| `tracker-sqld` | `ghcr.io/tursodatabase/libsql-server:latest` | `8080` | LibSQL/sqld sync-target database |
| `tracker-app` | Built from `Dockerfile` | `3000` | Next.js tracker web UI and API |

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

# 2. Generate a HS256 JWT token signed with that key.
#    Using the `jwt` CLI (npm install -g jsonwebtoken-cli) as an example:
#    jwt sign '{"sub":"app"}' "${SQLD_AUTH_JWT_KEY}"
#
#    Alternatively, generate via a short Node.js snippet:
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

| Volume | Stores |
|---|---|
| `tracker_tracker-sqld-data` | sqld WAL and database files (`/var/lib/sqld`) |
| `tracker_tracker-app-data` | Server-side local SQLite data (`/app/data`) |

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

| Variable | Default | Description |
|---|---|---|
| `SQLD_AUTH_JWT_KEY` | _(empty)_ | JWT key for sqld auth; leave empty to disable |
| `DATABASE_AUTH_TOKEN` | _(empty)_ | Bearer token the app sends to sqld |
| `SQLD_HTTP_PORT` | `8080` | Host port for the sqld HTTP endpoint |
| `APP_PORT` | `3000` | Host port for the tracker web UI |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Public base URL for the app |
