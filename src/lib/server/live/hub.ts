type Send = (data: string) => void;

const channels = new Map<number, Set<Send>>();

/** Subscribe to a day's live updates. Returns an unsubscribe function. */
export function subscribe(dayId: number, send: Send): () => void {
	let set = channels.get(dayId);
	if (!set) channels.set(dayId, (set = new Set()));
	set.add(send);
	return () => {
		const s = channels.get(dayId);
		if (!s) return;
		s.delete(send);
		if (s.size === 0) channels.delete(dayId);
	};
}

/** JSON-encode once and deliver to every subscriber; a throwing subscriber is removed without affecting others. */
export function publish(dayId: number, payload: object): void {
	const set = channels.get(dayId);
	if (!set) return;
	const data = JSON.stringify(payload);
	for (const send of [...set]) {
		try {
			send(data);
		} catch {
			set.delete(send);
		}
	}
	if (set.size === 0) channels.delete(dayId);
}

export const hub = { subscribe, publish };
