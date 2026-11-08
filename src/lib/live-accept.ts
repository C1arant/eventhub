type Versioned = { state: { status: string; version: number } };

/**
 * Is `incoming` at least as new as `current`? A reset sends the day back to idle at version 0,
 * so an idle snapshot is always accepted (idle only ever occurs before the first start or after a reset).
 */
export function isNewer(current: Versioned, incoming: Versioned): boolean {
	return incoming.state.status === 'idle' || incoming.state.version >= current.state.version;
}

/**
 * Guards a client's snapshot against out-of-order delivery. The first frame after every
 * (re)connect is authoritative (the server sends full state), which also recovers from a
 * reset that happened while this client was disconnected.
 */
export function createSnapshotGate() {
	let fresh = true;
	return {
		/** Call when the stream (re)connects. */
		connected() {
			fresh = true;
		},
		/** Should this stream frame replace the current snapshot? */
		accepts(current: Versioned, incoming: Versioned): boolean {
			if (fresh) {
				fresh = false;
				return true;
			}
			return isNewer(current, incoming);
		}
	};
}
