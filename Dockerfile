# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Build tools only needed if better-sqlite3 / argon2 have no prebuilt binary for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
	DATA_DIR=/app/data \
	MIGRATIONS_DIR=/app/drizzle \
	PORT=3000 \
	HOST=0.0.0.0 \
	BODY_SIZE_LIMIT=26214400 \
	PROTOCOL_HEADER=x-forwarded-proto \
	TZ=Europe/London
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node server.js ./
COPY --chown=node:node scripts ./scripts
RUN chmod +x /app/scripts/docker-entrypoint.sh
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
# Entrypoint starts as root, fixes data/backups ownership, then drops to the node user.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
