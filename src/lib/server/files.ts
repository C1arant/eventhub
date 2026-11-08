import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { eq, asc } from 'drizzle-orm';
import type { GuestActor } from './auth/can';
import { dataDir, type DB } from './db';
import { assignments, files, people } from './db/schema';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const TOO_LARGE = 'File too large (max 25 MB)';

export type FileRow = typeof files.$inferSelect;

/** Uploads directory, resolved at call time so tests/env can override it. */
export function uploadsDir(): string {
	return resolve(dataDir(), 'uploads');
}

const ALLOWED_MIME: ReadonlySet<string> = new Set([
	'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'
]);

/** Stored mime is only echoed back if allow-listed; everything else is an opaque download. */
export function safeContentType(mime: string): string {
	return ALLOWED_MIME.has(mime) ? mime : 'application/octet-stream';
}

/** Strip any path, control characters and quotes from a user-supplied filename. */
export function cleanName(raw: string): string {
	// eslint-disable-next-line no-control-regex
	const base = basename(raw.split('\\').join('/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
	return (base || 'file').slice(0, 200);
}

export function contentDispositionFor(name: string): string {
	const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').replace(/\r|\n/g, '_');
	const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Headers for a download response. Always a fresh mutable Headers. */
export function downloadHeaders(row: FileRow): Headers {
	return new Headers({
		'Content-Type': safeContentType(row.mime),
		'Content-Disposition': contentDispositionFor(row.name),
		'Content-Length': String(row.size),
		'X-Content-Type-Options': 'nosniff',
		'Cache-Control': 'private, no-store'
	});
}

function pathFor(storedName: string, dir: string): string {
	const root = resolve(dir);
	const full = resolve(root, storedName);
	if (!full.startsWith(root + sep)) throw new Error('Invalid stored file path');
	return full;
}

export async function saveUpload(
	db: DB,
	input: { eventId: number; assignmentId?: number | null; file: File },
	dir: string = uploadsDir()
): Promise<number> {
	const { file } = input;
	if (file.size > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);
	if (file.size === 0) throw new Error('File is empty');
	mkdirSync(dir, { recursive: true });
	const storedName = randomUUID();
	const final = pathFor(storedName, dir);
	const tmp = pathFor(`${storedName}.tmp`, dir);
	try {
		// Stream to a temp file; the counting transform enforces the cap even if file.size lied.
		let written = 0;
		const counter = new Transform({
			transform(chunk: Buffer, _enc, cb) {
				written += chunk.length;
				if (written > MAX_UPLOAD_BYTES) cb(new Error(TOO_LARGE));
				else cb(null, chunk);
			}
		});
		try {
			await pipeline(Readable.fromWeb(file.stream() as never), counter, createWriteStream(tmp, { flags: 'wx' }));
		} catch (e) {
			if (e instanceof Error && e.message === TOO_LARGE) throw e;
			throw new Error('Could not save the file', { cause: e });
		}
		if (written === 0) throw new Error('File is empty');
		await rename(tmp, final);
		try {
			return db
				.insert(files)
				.values({
					eventId: input.eventId,
					assignmentId: input.assignmentId ?? null,
					name: cleanName(file.name),
					mime: (file.type || 'application/octet-stream').slice(0, 100),
					size: written,
					storedName,
					uploadedAt: Date.now()
				})
				.returning({ id: files.id })
				.get().id;
		} catch (e) {
			await unlink(final).catch(() => {});
			throw e;
		}
	} catch (e) {
		await unlink(tmp).catch(() => {});
		throw e;
	}
}

export function getFile(db: DB, id: number): FileRow | undefined {
	return db.select().from(files).where(eq(files.id, id)).get();
}

/**
 * Open the stored file before any response is built. Returns a web stream reading from the
 * open handle, or null if the file is gone from disk (callers answer 404).
 */
export async function openDownload(row: Pick<FileRow, 'storedName'>, dir: string = uploadsDir()): Promise<ReadableStream | null> {
	let fh;
	try {
		fh = await open(pathFor(row.storedName, dir), 'r');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
	return Readable.toWeb(fh.createReadStream({ autoClose: true })) as unknown as ReadableStream;
}

export function deleteFile(db: DB, id: number, dir: string = uploadsDir()): void {
	const row = getFile(db, id);
	if (!row) return;
	db.delete(files).where(eq(files.id, id)).run();
	try {
		unlinkSync(pathFor(row.storedName, dir));
	} catch {
		/* already gone */
	}
}

export type FileListItem = FileRow & { guestName: string | null };

export function listFiles(db: DB, eventId: number): FileListItem[] {
	return db
		.select({ file: files, guestName: people.name })
		.from(files)
		.leftJoin(assignments, eq(assignments.id, files.assignmentId))
		.leftJoin(people, eq(people.id, assignments.personId))
		.where(eq(files.eventId, eventId))
		.orderBy(asc(files.id))
		.all()
		.map((r) => ({ ...r.file, guestName: r.guestName }));
}

/** The file, only if it was shared with this guest's assignment in this guest's event. */
export function guestCanDownload(db: DB, actor: GuestActor, fileId: number): FileRow | null {
	const row = getFile(db, fileId);
	if (!row || row.assignmentId === null) return null;
	if (row.assignmentId !== actor.assignmentId || row.eventId !== actor.eventId) return null;
	return row;
}

/** Remove the disk files of every file row belonging to an event (call before deleting the event). */
export function deleteEventFiles(db: DB, eventId: number, dir: string = uploadsDir()): void {
	for (const f of db.select({ storedName: files.storedName }).from(files).where(eq(files.eventId, eventId)).all()) {
		try {
			unlinkSync(pathFor(f.storedName, dir));
		} catch {
			/* already gone */
		}
	}
}

/** Delete upload files with no matching row. Temp files younger than 1 h are left (in-flight uploads). */
export function sweepOrphanUploads(db: DB, dir: string = uploadsDir(), now: number = Date.now()): number {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return 0;
	}
	const known = new Set(db.select({ n: files.storedName }).from(files).all().map((r) => r.n));
	let removed = 0;
	for (const name of names) {
		if (known.has(name)) continue;
		try {
			const full = pathFor(name, dir);
			const st = statSync(full);
			if (!st.isFile()) continue;
			if (name.endsWith('.tmp') && now - st.mtimeMs < 3_600_000) continue;
			unlinkSync(full);
			removed++;
		} catch {
			/* ignore */
		}
	}
	return removed;
}
