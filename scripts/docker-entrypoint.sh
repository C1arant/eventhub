#!/bin/sh
# Starts as root only to make the bind-mounted data/backups dirs writable (Docker creates
# missing bind-mount sources as root:root), then drops to the unprivileged "node" user.
set -e
for d in /app/data /app/backups; do
	mkdir -p "$d"
	if ! setpriv --reuid=node --regid=node --init-groups test -w "$d"; then
		chown -R node:node "$d"
	fi
done
exec setpriv --reuid=node --regid=node --init-groups "$@"
