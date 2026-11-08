import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { foldersToPrune } from '../../scripts/backup-lib.mjs';

describe('foldersToPrune', () => {
	it('keeps the last 14 days and prunes older ones', () => {
		const names = ['2026-10-24', '2026-10-25', '2026-11-08', '2026-10-31'];
		expect(foldersToPrune(names, '2026-11-08', 14)).toEqual(['2026-10-24']);
	});
	it('handles month and year boundaries', () => {
		expect(foldersToPrune(['2025-12-31', '2026-01-01', '2026-01-06', '2026-01-07'], '2026-01-20', 14)).toEqual(['2025-12-31', '2026-01-01']);
	});
	it('ignores non-date entries', () => {
		expect(foldersToPrune(['notes.txt', '2020-01-01x', '.DS_Store'], '2026-11-08')).toEqual([]);
	});
	it('rejects a bad today', () => {
		expect(() => foldersToPrune([], 'nope')).toThrow();
	});
});
