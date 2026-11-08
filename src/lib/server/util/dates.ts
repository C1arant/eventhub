// Calendar-day arithmetic on wall-clock 'YYYY-MM-DD' strings. Never uses local time,
// so DST changes cannot shift results.
function parse(date: string): number {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!m) throw new Error(`Invalid date: ${date}`);
	return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function format(ms: number): string {
	const d = new Date(ms);
	const y = String(d.getUTCFullYear()).padStart(4, '0');
	const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
	const da = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${da}`;
}

export function addDays(date: string, n: number): string {
	const d = new Date(parse(date));
	d.setUTCDate(d.getUTCDate() + n);
	return format(d.getTime());
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
	return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export function timeToMin(time: string): number {
	const m = /^(\d{1,2}):(\d{2})$/.exec(time);
	if (!m) throw new Error(`Invalid time: ${time}`);
	return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since the start of the day (may exceed 1440) to a clock time plus day offset. */
export function minToClock(min: number): { clock: string; dayOffset: number } {
	const dayOffset = Math.floor(min / 1440);
	const rem = min - dayOffset * 1440;
	const h = String(Math.floor(rem / 60)).padStart(2, '0');
	const mm = String(rem % 60).padStart(2, '0');
	return { clock: `${h}:${mm}`, dayOffset };
}
