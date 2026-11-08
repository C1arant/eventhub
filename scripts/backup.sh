#!/usr/bin/env bash
# Host-side wrapper: runs the backup inside the app container. Backups land in ./backups/YYYY-MM-DD/.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T -u node app node scripts/backup.mjs
