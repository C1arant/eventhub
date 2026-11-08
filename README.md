# EventHub

Self-hosted planning and live-running tool for events (gigs, club nights, theatre, corporate, esports, charity streams). SvelteKit + SQLite, runs on one small machine.

## Features

- Events with days, tasks (sections, priorities), people/crew and call sheets
- Templates (with calendar-safe date shifting) and starter templates
- Run of show with times past midnight, departments and file uploads (25 MB)
- Live mode: current/next item, controls, SSE updates, guest and display links with revocable tokens
- Search, owner/crew/guest roles, invites, argon2id passwords, login rate limiting

## Quick start (development)

```bash
npm install
npm run dev          # http://localhost:5173
```

Data lives under `DATA_DIR` (default `./data`). The first visit shows owner setup; there are no default credentials.

## Production (Docker)

```bash
mkdir -p data backups
cp .env.example .env
docker compose up -d --build
# open http://localhost:3000/setup
```

Full guide for the Omarchy home PC (Docker install, Cloudflare Tunnel or Tailscale Funnel, backups, updating, restoring): [docs/deploy-omarchy.md](docs/deploy-omarchy.md).

## Tests

```bash
npm test             # unit tests (Vitest)
npm run check        # svelte-check / types
npm run test:e2e     # Playwright; builds the app and runs `node server.js`
```

The first e2e run needs `npx playwright install chromium`.

## Notes

- Node: developed on Node 26 (22+ works); the Docker image uses Node 24 LTS (`node:24-bookworm-slim`).
- `server.js` wraps the adapter-node handler so plain-http access works (adapter-node 6 ignores a runtime `ORIGIN`).
- Backups: `scripts/backup.mjs` (see the deploy doc).

## Manual checks on the Omarchy PC

Docker could not be run on the Windows dev machine, so verify these on the target:

1. `docker compose build` succeeds (better-sqlite3 and @node-rs/argon2 install in the image).
2. `docker compose up -d`; `docker compose ps` shows `app` as `healthy`; `curl localhost:3000/healthz` prints `ok`.
3. http://localhost:3000/setup creates the owner (no 403), then login works.
4. `./data` persists across `docker compose down && docker compose up -d`; with `data/` and `backups/` deleted first, `docker compose up -d` still starts (entrypoint chowns them to uid 1000) and `ls -ln data` shows uid 1000.
5. `./scripts/backup.sh` creates `backups/<today>/eventhub.db` (+ `uploads/`); `sqlite3 backups/<today>/eventhub.db "pragma integrity_check"` prints `ok`.
6. `docker compose --profile cloudflare up -d` (or `tailscale`): the public URL loads on a phone, form posts work (no 403), and five bad logins from one phone do not lock out a second device (confirms `ADDRESS_HEADER`).
7. The image tags pinned in `docker-compose.yml` (`cloudflare/cloudflared:2025.11.1`, `tailscale/tailscale:v1.90.6`) pull successfully; bump them if not. Confirm the Tailscale serve config (`deploy/tailscale-serve.json`) enables Funnel (`tailscale funnel status` inside the container).
8. `systemctl --user list-timers` shows `eventhub-backup.timer`; `systemctl --user start eventhub-backup.service` produces a backup.
9. Reboot the PC: the containers return on their own.
