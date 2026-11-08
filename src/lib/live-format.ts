/** mm:ss (h:mm:ss from one hour up) for a non-negative number of seconds. */
export function fmtClock(sec: number): string {
	const s = Math.max(0, Math.floor(sec));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

export function fmtOverUnder(sec: number): { text: string; tone: 'late' | 'early' | 'ontime' } {
	const r = Math.round(sec);
	if (r === 0) return { text: 'On time', tone: 'ontime' };
	return r > 0
		? { text: `+${fmtClock(r).replace(/^0/, '')} late`, tone: 'late' }
		: { text: `−${fmtClock(-r).replace(/^0/, '')} early`, tone: 'early' };
}
