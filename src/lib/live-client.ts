export type LiveStatusEvent = 'connected' | 'reconnecting' | 'denied';

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/**
 * EventSource wrapper with our own reconnect loop (backoff 1s, 2s, 4s, 8s, then 15s max).
 * Every (re)connect receives the full state from the server, so no replay logic is needed.
 */
export function createLiveClient<T = unknown>(
	url: string,
	onState: (s: T) => void,
	onStatus: (s: LiveStatusEvent) => void,
	/** Optional URL answering 200 while access is valid and 403/404 once it is revoked; checked after each stream error. */
	checkUrl?: string
): { close(): void } {
	let es: EventSource | null = null;
	let attempt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let closed = false;

	const connect = () => {
		if (closed) return;
		const source = new EventSource(url);
		es = source;
		source.onopen = () => {
			attempt = 0;
			onStatus('connected');
		};
		source.addEventListener('state', (e) => {
			try {
				onState(JSON.parse((e as MessageEvent).data) as T);
			} catch {
				/* ignore malformed frame */
			}
		});
		source.onerror = () => {
			// Close ourselves so the browser's own (unbounded-rate) retry does not race ours.
			source.close();
			if (closed) return;
			onStatus('reconnecting');
			const schedule = () => {
				if (closed) return;
				const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
				attempt++;
				timer = setTimeout(connect, delay);
			};
			if (!checkUrl) return schedule();
			// A revoked link/session is terminal: stop retrying instead of hammering the server.
			fetch(checkUrl, { cache: 'no-store' })
				.then((r) => {
					if (closed) return;
					if (r.status === 404 || r.status === 403 || r.status === 401) {
						closed = true;
						onStatus('denied');
					} else schedule();
				})
				.catch(schedule);
		};
	};
	connect();

	return {
		close() {
			closed = true;
			if (timer) clearTimeout(timer);
			es?.close();
		}
	};
}
