import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '../../src/lib/server/db/test-db';
import { assignments, events, files, people } from '../../src/lib/server/db/schema';
import {
	contentDispositionFor, deleteFile, fileStream, getFile, guestCanDownload, listFiles, safeContentType, saveUpload
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
		for await (const c of fileStream(row, dir)) text += Buffer.from(c).toString();
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

describe('path safety', () => {
	it('fileStream refuses a stored name that escapes the uploads dir', () => {
		const row = { storedName: '../x' } as never;
		expect(() => fileStream(row, dir)).toThrow();
		writeFileSync(join(dir, 'ok'), 'z');
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
	it('content-disposition is ascii-safe with filename*', () => {
		const h = contentDispositionFor('Ríder "final"\r\nX: y.pdf');
		expect(h).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/);
		expect(h).not.toMatch(/[\r\n]/);
		expect(h.split('; filename=')[1]).not.toContain('""');
		expect(h).toContain("filename*=UTF-8''R%C3%ADder");
		expect(contentDispositionFor('plain.pdf')).toBe(`attachment; filename="plain.pdf"; filename*=UTF-8''plain.pdf`);
	});
});
