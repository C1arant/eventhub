import { describe, expect, it } from 'vitest';
import { createSnapshotGate, isNewer } from '../../src/lib/live-accept';

const snap = (status: string, version: number) => ({ state: { status, version } });

describe('isNewer', () => {
	it('accepts equal or higher versions, rejects lower', () => {
		expect(isNewer(snap('running', 5), snap('running', 5))).toBe(true);
		expect(isNewer(snap('running', 5), snap('running', 6))).toBe(true);
		expect(isNewer(snap('running', 5), snap('running', 4))).toBe(false);
	});
	it('accepts an idle snapshot even though a reset sends the version back to 0', () => {
		expect(isNewer(snap('running', 20), snap('idle', 0))).toBe(true);
	});
});

describe('createSnapshotGate', () => {
	it('first frame after (re)connect is authoritative, then versions are enforced', () => {
		const g = createSnapshotGate();
		expect(g.accepts(snap('running', 20), snap('running', 1))).toBe(true); // reset happened while disconnected
		expect(g.accepts(snap('running', 1), snap('running', 0))).toBe(false);
		g.connected();
		expect(g.accepts(snap('running', 9), snap('running', 3))).toBe(true);
		expect(g.accepts(snap('running', 3), snap('running', 2))).toBe(false);
	});
});
