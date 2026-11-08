export type MathSnap = {
	state: { status: 'idle' | 'running' | 'held' | 'finished'; currentStartedAt: number | null };
	now: { durationSec: number } | null;
	remainingSec: number | null;
	overUnderSec: number;
	serverNow: number;
};

/** Server time as seen from this device: local clock plus the skew measured when the snapshot arrived. */
const serverTime = (localNow: number, skewMs: number) => localNow + skewMs;

/** Seconds left on the current item (negative once over); frozen while held; null when idle/finished. */
export function remainingNow(s: MathSnap, localNow: number, skewMs: number): number | null {
	if (s.remainingSec === null || !s.now) return null;
	if (s.state.status !== 'running' || s.state.currentStartedAt === null) return s.remainingSec;
	const end = s.state.currentStartedAt + s.now.durationSec * 1000;
	return Math.round((end - serverTime(localNow, skewMs)) / 1000);
}

/** Positive = late. Grows 1:1 once the item overruns, and 1:1 for the whole of a hold (matches the server). */
export function overUnderNow(s: MathSnap, localNow: number, skewMs: number): number {
	const base = s.overUnderSec;
	if (s.state.status === 'held') {
		return base + Math.max(0, Math.round((serverTime(localNow, skewMs) - s.serverNow) / 1000));
	}
	if (s.state.status === 'running') {
		const rem = remainingNow(s, localNow, skewMs);
		if (rem !== null && s.remainingSec !== null) return base + Math.max(0, -rem) - Math.max(0, -s.remainingSec);
	}
	return base;
}
