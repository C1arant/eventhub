import type { LiveSnapshot } from './store.js';

type Timed = NonNullable<LiveSnapshot['now']>;
const pick = (t: Timed | null) =>
	t && { id: t.id, title: t.title, type: t.type, durationSec: t.durationSec, people: t.people, clock: t.clock, dayOffset: t.dayOffset };

/** Wire shape for streams and action replies: no department notes or hard-start internals, safe for guests and displays. */
export function wireSnapshot(s: LiveSnapshot, serverNow = Date.now()) {
	return {
		state: s.state,
		now: pick(s.now),
		next: pick(s.next),
		after: pick(s.after),
		remainingSec: s.remainingSec,
		overUnderSec: s.overUnderSec,
		serverNow
	};
}
