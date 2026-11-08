import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, events, files, people } from '../../src/lib/server/db/schema';
import {
	contentDispositionFor, deleteEventFiles, downloadHeaders, deleteFile, getFile, guestCanDownload, listFiles, openDownload, safeContentType, saveUpload, sweepOrphanUploads
} from '../../src/lib/server/files';
import type { GuestActor } from '../../src/lib/server/auth/can';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'eh-up-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
	const db = createTestDb();
	const ev = db.insert(events).values({ name: 'E', type: 'gig', startDate: '2099-01-01', endDate: '2099-01-01', createdAt: 0 }).returning().get();
	const ev2 = db.insert(events).values({ name: 'E2', type: 'gig', startDate: '2099-01-01', endDate: '2099-01-01', createdAt: 0 }).returning().get();
	const p1 = db.insert(people).values({ name: 'A', phone: '', email: '', needs: '', notes: '' }).returning().get();
	const p2 = db.insert(people).values({ name: 'B', phone: '', email: '', needs: '', notes: '' }).returning().get();
	const a1 = db.insert(assignments).values({ eventId: ev.id, personId: p1.id, eventRole: '' }).returning().get();
	const a2 = db.insert(assignments).values({ eventId: ev.id, personId: p2.id, eventRole: '' }).returning().get();
	return { db, ev, ev2, p1, a1, a2 };
}
const guest = (a: { id: number; eventId: number; personId: number }): GuestActor => ({
	kind: 'guest', assignmentId: a.id, eventId: a.eventId, personId: a.personId, liveAccess: false
});

describe('saveUpload', () => {
	it('rejects > 25 MB and leaves nothing in the uploads dir', async () => {
		const { db, ev } = setup();
		const big = new File([new Uint8Array(26 * 1024 * 1024)], 'big.bin');
		await expect(saveUpload(db, { eventId: ev.id, file: big }, dir)).rejects.toThrow('File too large (max 25 MB)');
		expect(readdirSync(dir)).toEqual([]);
		expect(db.select().from(files).all()).toEqual([]);
	});

	it('rejects empty files', async () => {
		const { db, ev } = setup();
		await expect(saveUpload(db, { eventId: ev.id, file: new File([], 'e.txt') }, dir)).rejects.toThrow('File is empty');
		expect(readdirSync(dir)).toEqual([]);
	});

	it('saves row + disk file; stored name is a uuid, not the user name', async () => {
		const { db, ev, a1 } = setup();
		const id = await saveUpload(db, { eventId: ev.id, assignmentId: a1.id, file: new File(['hello'], '../../evil.pdf', { type: 'application/pdf' }) }, dir);
		const row = getFile(db, id)!;
		expect(row.size).toBe(5);
		expect(row.name).toBe('evil.pdf');
		expect(row.assignmentId).toBe(a1.id);
		expect(row.storedName).toMatch(/^[0-9a-f-]{36}$/);
		expect(readdirSync(dir)).toEqual([row.storedName]);
		let text = '';
		const body = (await openDownload(row, dir))!;
		for await (const c of body as unknown as AsyncIterable<Uint8Array>) text += Buffer.from(c).toString();
		expect(text).toBe('hello');
		expect(listFiles(db, ev.id).map((f) => f.id)).toEqual([id]);
	});

	it('removes the temp file when the DB insert fails', async () => {
		const { db } = setup();
		await expect(saveUpload(db, { eventId: 99999, file: new File(['x'], 'x.txt') }, dir)).rejects.toThrow();
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe('deleteFile', () => {
	it('removes row and disk file', async () => {
		const { db, ev } = setup();
		const id = await saveUpload(db, { eventId: ev.id, file: new File(['hi'], 'a.txt') }, dir);
		const row = getFile(db, id)!;
		deleteFile(db, id, dir);
		expect(getFile(db, id)).toBeUndefined();
		expect(existsSync(join(dir, row.storedName))).toBe(false);
	});
	it('still removes the row if the disk file is already gone', async () => {
		const { db, ev } = setup();
		const id = await saveUpload(db, { eventId: ev.id, file: new File(['hi'], 'a.txt') }, dir);
		rmSync(join(dir, getFile(db, id)!.storedName));
		deleteFile(db, id, dir);
		expect(getFile(db, id)).toBeUndefined();
	});
});

describe('path safety / missing file', () => {
	it('openDownload refuses a stored name that escapes the uploads dir', async () => {
		await expect(openDownload({ storedName: '../x' }, dir)).rejects.toThrow();
	});
	it('openDownload returns null when the file is gone from disk', async () => {
		expect(await openDownload({ storedName: 'nope' }, dir)).toBeNull();
	});
});

describe('write failures', () => {
	it('rejects clearly, with no unhandled rejection and nothing left behind', async () => {
		const { db, ev } = setup();
		const unhandled: unknown[] = [];
		const h = (e: unknown) => unhandled.push(e);
		process.on('unhandledRejection', h);
		// uploads "dir" is a regular file, so mkdir/open/write cannot succeed
		const bad = join(dir, 'iamafile');
		writeFileSync(bad, 'x');
		await expect(saveUpload(db, { eventId: ev.id, file: new File(['abc'], 'a.txt') }, bad)).rejects.toThrow();
		await new Promise((r) => setTimeout(r, 20));
		process.off('unhandledRejection', h);
		expect(unhandled).toEqual([]);
		expect(readdirSync(dir)).toEqual(['iamafile']);
		expect(db.select().from(files).all()).toEqual([]);
	});
	it('a stream that fails mid-upload gives "Could not save the file" and leaves no temp file', async () => {
		const { db, ev } = setup();
		const file = new File(['abc'], 'a.txt');
		let n = 0;
		file.stream = () => new ReadableStream({
			pull(c) {
				if (n++ === 0) c.enqueue(new Uint8Array([1, 2, 3]));
				else c.error(new Error('ENOSPC'));
			}
		});
		await expect(saveUpload(db, { eventId: ev.id, file }, dir)).rejects.toThrow('Could not save the file');
		expect(readdirSync(dir)).toEqual([]);
		expect(db.select().from(files).all()).toEqual([]);
	});
});

describe('orphan sweep / event files', () => {
	it('removes unreferenced files and stale temps, keeps referenced and fresh temps', async () => {
		const { db, ev } = setup();
		const id = await saveUpload(db, { eventId: ev.id, file: new File(['k'], 'k.txt') }, dir);
		const keep = getFile(db, id)!.storedName;
		writeFileSync(join(dir, 'orphan'), 'o');
		writeFileSync(join(dir, 'old.tmp'), 'o');
		writeFileSync(join(dir, 'fresh.tmp'), 'o');
		const now = Date.now();
		utimesSync(join(dir, 'old.tmp'), new Date(now - 2 * 3600_000), new Date(now - 2 * 3600_000));
		expect(sweepOrphanUploads(db, dir, now)).toBe(2);
		expect(readdirSync(dir).sort()).toEqual([keep, 'fresh.tmp'].sort());
	});
	it('missing uploads dir is fine', () => {
		const { db } = setup();
		expect(sweepOrphanUploads(db, join(dir, 'nope'))).toBe(0);
	});
	it('deleteEventFiles removes only the given event disk files', async () => {
		const { db, ev, ev2 } = setup();
		const a = await saveUpload(db, { eventId: ev.id, file: new File(['1'], 'a.txt') }, dir);
		const b = await saveUpload(db, { eventId: ev2.id, file: new File(['2'], 'b.txt') }, dir);
		deleteEventFiles(db, ev.id, dir);
		expect(readdirSync(dir)).toEqual([getFile(db, b)!.storedName]);
		expect(getFile(db, a)).toBeDefined();
	});
});

describe('guestCanDownload', () => {
	it("allows own file only; not another assignment's, not another event's, not unassigned", async () => {
		const { db, ev, ev2, a1, a2 } = setup();
		const mine = await saveUpload(db, { eventId: ev.id, assignmentId: a1.id, file: new File(['1'], 'm.txt') }, dir);
		const theirs = await saveUpload(db, { eventId: ev.id, assignmentId: a2.id, file: new File(['2'], 't.txt') }, dir);
		const general = await saveUpload(db, { eventId: ev.id, file: new File(['3'], 'g.txt') }, dir);
		const g = guest(a1);
		expect(guestCanDownload(db, g, mine)?.id).toBe(mine);
		expect(guestCanDownload(db, g, theirs)).toBeNull();
		expect(guestCanDownload(db, g, general)).toBeNull();
		expect(guestCanDownload(db, g, 424242)).toBeNull();
		expect(guestCanDownload(db, { ...g, eventId: ev2.id }, mine)).toBeNull();
	});
});

describe('headers', () => {
	it('content-type allow-list', () => {
		for (const m of ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'])
			expect(safeContentType(m)).toBe(m);
		for (const m of ['text/html', 'image/svg+xml', 'application/javascript', '', 'text/plain; charset=x'])
			expect(safeContentType(m)).toBe('application/octet-stream');
	});
	it('downloads are private no-store', () => {
		expect(downloadHeaders({ mime: 'text/plain', name: 'a', size: 1 } as never).get('cache-control')).toBe('private, no-store');
	});
	it('content-disposition is ascii-safe with filename*', () => {
		const h = contentDispositionFor('Ríder "final"\r\nX: y.pdf');
		expect(h).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/);
		expect(h).not.toMatch(/[\r\n]/);
		expect(h.split('; filename=')[1]).not.toContain('""');
		expect(h).toContain("filename*=UTF-8''R%C3%ADder");
		expect(contentDispositionFor('plain.pdf')).toBe(`attachment; filename="plain.pdf"; filename*=UTF-8''plain.pdf`);
	});
});
