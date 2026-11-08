import { describe, expect, it } from 'vitest';
import { applyTokenPathHeaders } from '../../src/hooks.server';

const h = (p: string) => {
	const x = new Headers();
	applyTokenPathHeaders(p, x);
	return x;
};
describe('applyTokenPathHeaders', () => {
	it('sets headers on /g/ and /display/ paths', () => {
		for (const p of ['/g/abc', '/g/abc/live/1', '/display/t/1']) {
			expect(h(p).get('Referrer-Policy')).toBe('no-referrer');
			expect(h(p).get('Cache-Control')).toBe('no-store');
		}
	});
	it('leaves other paths alone', () => {
		expect(h('/events').get('Cache-Control')).toBeNull();
		expect(h('/gx/1').get('Referrer-Policy')).toBeNull();
	});
});
