import { describe, expect, it } from 'vitest';
import { addDays, diffDays, minToClock, timeToMin } from '../../src/lib/server/util/dates';

describe('dates', () => {
	it('addDays crosses the UK DST change exactly', () => {
		expect(addDays('2026-10-25', -3)).toBe('2026-10-22');
		expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
	});
	it('diffDays is b - a across year boundary', () => {
		expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
		expect(diffDays('2027-01-02', '2026-12-30')).toBe(-3);
	});
	it('minToClock wraps past midnight', () => {
		expect(minToClock(1470)).toEqual({ clock: '00:30', dayOffset: 1 });
		expect(minToClock(90)).toEqual({ clock: '01:30', dayOffset: 0 });
	});
	it('timeToMin parses HH:MM', () => {
		expect(timeToMin('23:45')).toBe(1425);
	});
});
