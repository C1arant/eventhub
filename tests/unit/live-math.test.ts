import { describe, expect, it } from 'vitest';
import { fmtClock, fmtOverUnder } from '../../src/lib/live-format';
import { overUnderNow, remainingNow, type MathSnap } from '../../src/lib/live-math';

const snap = (o: Partial<MathSnap> & { status: MathSnap['state']['status'] }): MathSnap => ({
	state: { status: o.status, currentStartedAt: o.state?.currentStartedAt ?? null },
	now: o.now === undefined ? { durationSec: 300 } : o.now,
	remainingSec: o.remainingSec === undefined ? null : o.remainingSec,
	overUnderSec: o.overUnderSec ?? 0,
	serverNow: o.serverNow ?? 1_000_000
});

describe('live math', () => {
	it('running: counts down, goes negative, skew corrected', () => {
		const s = snap({ status: 'running', state: { status: 'running', currentStartedAt: 1_000_000 - 100_000 }, remainingSec: 200 });
		expect(remainingNow(s, 1_000_000, 0)).toBe(200);
		expect(remainingNow(s, 1_010_000, 0)).toBe(190);
		// device clock 5 s ahead of the server
		expect(remainingNow(s, 1_005_000, -5000)).toBe(200);
		expect(remainingNow(s, 1_000_000 + 250_000, 0)).toBe(-50);
	});
	it('running: over/under only grows once overrunning', () => {
		const s = snap({ status: 'running', state: { status: 'running', currentStartedAt: 1_000_000 - 100_000 }, remainingSec: 200, overUnderSec: -10 });
		expect(overUnderNow(s, 1_100_000, 0)).toBe(-10);
		expect(overUnderNow(s, 1_000_000 + 230_000, 0)).toBe(20); // 30 s past the end
		const late = snap({ status: 'running', state: { status: 'running', currentStartedAt: 1_000_000 - 310_000 }, remainingSec: -10, overUnderSec: 10 });
		expect(overUnderNow(late, 1_005_000, 0)).toBe(15);
	});
	it('held: remaining frozen, lateness keeps growing', () => {
		const s = snap({ status: 'held', state: { status: 'held', currentStartedAt: 900_000 }, remainingSec: 120, overUnderSec: 30 });
		expect(remainingNow(s, 1_060_000, 0)).toBe(120);
		expect(overUnderNow(s, 1_000_000, 0)).toBe(30);
		expect(overUnderNow(s, 1_060_000, 0)).toBe(90);
		expect(overUnderNow(s, 900_000, 0)).toBe(30); // never shrinks
	});
	it('idle and finished: nothing ticks', () => {
		const idle = snap({ status: 'idle', now: null });
		expect(remainingNow(idle, 9e9, 0)).toBeNull();
		expect(overUnderNow(idle, 9e9, 0)).toBe(0);
		const fin = snap({ status: 'finished', now: null, overUnderSec: -70 });
		expect(overUnderNow(fin, 9e9, 0)).toBe(-70);
	});
	it('formats', () => {
		expect(fmtClock(0)).toBe('00:00');
		expect(fmtClock(65)).toBe('01:05');
		expect(fmtClock(3725)).toBe('1:02:05');
		expect(fmtClock(-5)).toBe('00:00');
		expect(fmtOverUnder(270)).toEqual({ text: '+4:30 late', tone: 'late' });
		expect(fmtOverUnder(-70)).toEqual({ text: '−1:10 early', tone: 'early' });
		expect(fmtOverUnder(0)).toEqual({ text: 'On time', tone: 'ontime' });
	});
});
