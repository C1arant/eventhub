# EventHub

Self-hosted event planning app (SvelteKit + SQLite).

- `npm test` runs unit tests, `npm run db:generate` generates migrations.
- Data lives under `DATA_DIR` (default `./data`).
- Node 22+ works locally (verified on Node 26 with better-sqlite3 13); Docker image targets Node 24 LTS.
