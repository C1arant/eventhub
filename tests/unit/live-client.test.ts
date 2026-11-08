import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveClient } from '../../src/lib/live-client';

class FakeES {
	static all: FakeES[] = [];
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	listeners: Record<string, (e: { data: string }) => void> = {};
	constructor(public url: string) {
		FakeES.all.push(this);
	}
	addEventListener(t: string, f: (e: { data: string }) => void) {
		this.listeners[t] = f;
	}
	close() {
		this.closed = true;
	}
}

describe('createLiveClient', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		FakeES.all = [];
		vi.stubGlobal('EventSource', FakeES);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('backs off 1,2,4,8,15,15 s and reports status', () => {
		const status: string[] = [];
		createLiveClient('/x', () => {}, (s) => status.push(s));
		const delays: number[] = [];
		for (let i = 0; i < 6; i++) {
			const es = FakeES.all.at(-1)!;
			const before = FakeES.all.length;
			es.onerror!();
			expect(es.closed).toBe(true);
			// find the delay: advance until a new ES appears
			let waited = 0;
			while (FakeES.all.length === before && waited < 20000) {
				vi.advanceTimersByTime(500);
				waited += 500;
			}
			delays.push(waited);
		}
		expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
		expect(status[0]).toBe('reconnecting');
		FakeES.all.at(-1)!.onopen!();
		expect(status.at(-1)).toBe('connected');
	});

	it('resets backoff after open, parses state events, and close() stops reconnects', () => {
		const states: unknown[] = [];
		const c = createLiveClient('/x', (s) => states.push(s), () => {});
		let es = FakeES.all.at(-1)!;
		es.onerror!();
		vi.advanceTimersByTime(1000);
		es = FakeES.all.at(-1)!;
		es.onopen!();
		es.listeners.state({ data: '{"a":1}' });
		expect(states).toEqual([{ a: 1 }]);
		es.onerror!();
		const n = FakeES.all.length;
		vi.advanceTimersByTime(1000);
		expect(FakeES.all.length).toBe(n + 1);
		c.close();
		FakeES.all.at(-1)!.onerror?.();
		vi.advanceTimersByTime(20000);
		expect(FakeES.all.length).toBe(n + 1);
	});
});
