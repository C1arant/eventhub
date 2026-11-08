import { describe, expect, it } from 'vitest';
import { applyAction, type LiveState } from '../../src/lib/server/live/machine';

const idle: LiveState = { status: 'idle', currentItemId: null, currentStartedAt: null, heldAt: null, version: 0 };
const running = (id: number, at = 1000, version = 1): LiveState => ({ status: 'running', currentItemId: id, currentStartedAt: at, heldAt: null, version });
const ok = (r: ReturnType<typeof applyAction>) => {
	if (!('state' in r)) throw new Error('expected state, got ' + r.error);
	return r.state;
};

describe('applyAction', () => {
	it('start on a day with no items is rejected as empty (Review Focus 5)', () => {
		expect(applyAction(idle, [], { type: 'start' }, 5)).toEqual({ error: 'empty' });
	});
	it('start runs the first item and bumps version', () => {
		const s = ok(applyAction(idle, [7, 8], { type: 'start' }, 5000));
		expect(s).toEqual({ status: 'running', currentItemId: 7, currentStartedAt: 5000, heldAt: null, version: 1 });
	});
	it('next advances; skip behaves the same', () => {
		expect(ok(applyAction(running(7), [7, 8], { type: 'next' }, 9000))).toMatchObject({ currentItemId: 8, currentStartedAt: 9000, version: 2 });
		expect(ok(applyAction(running(7), [7, 8], { type: 'skip' }, 9000))).toMatchObject({ currentItemId: 8, currentStartedAt: 9000 });
	});
	it('next on the last item finishes (Review Focus 5)', () => {
		const s = ok(applyAction(running(8), [7, 8], { type: 'next' }, 9000));
		expect(s).toMatchObject({ status: 'finished', currentItemId: null, currentStartedAt: null, heldAt: null, version: 2 });
	});
	it('back restarts the previous item; on the first item it is invalid', () => {
		expect(ok(applyAction(running(8), [7, 8], { type: 'back' }, 9000))).toMatchObject({ currentItemId: 7, currentStartedAt: 9000 });
		expect(applyAction(running(7), [7, 8], { type: 'back' }, 9000)).toEqual({ error: 'invalid' });
	});
	it('hold then resume 30 s later shifts currentStartedAt by 30000', () => {
		const h = ok(applyAction(running(7, 1000), [7], { type: 'hold' }, 10_000));
		expect(h).toMatchObject({ status: 'held', heldAt: 10_000 });
		const r = ok(applyAction(h, [7], { type: 'resume' }, 40_000));
		expect(r).toMatchObject({ status: 'running', currentStartedAt: 31_000, heldAt: null });
	});
	it('rejects actions in the wrong status', () => {
		expect(applyAction(idle, [7], { type: 'next' }, 1)).toEqual({ error: 'invalid' });
		expect(applyAction(running(7), [7], { type: 'resume' }, 1)).toEqual({ error: 'invalid' });
		expect(applyAction(running(7), [7], { type: 'start' }, 1)).toEqual({ error: 'invalid' });
		expect(applyAction(idle, [7], { type: 'insertQuickItem', title: 'x', durationSec: 60 }, 1)).toEqual({ error: 'invalid' });
	});
	it('finish ends the show', () => {
		expect(ok(applyAction(running(7), [7, 8], { type: 'finish' }, 5))).toMatchObject({ status: 'finished', currentItemId: null });
	});
});
