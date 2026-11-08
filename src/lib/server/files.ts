import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
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
		'X-Content-Type-Options': 'nosniff'
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
		// Stream to a temp file, counting bytes so a lying size can't exceed the cap.
		let written = 0;
		const out = createWriteStream(tmp, { flags: 'wx' });
		const done = new Promise<void>((res, rej) => {
			out.on('error', rej);
			out.on('finish', res);
		});
		const reader = file.stream().getReader();
		try {
			for (;;) {
				const { done: end, value } = await reader.read();
				if (end) break;
				written += value.byteLength;
				if (written > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);
				if (!out.write(value)) await new Promise((r) => out.once('drain', r));
			}
		} catch (e) {
			out.destroy();
			throw e;
		}
		out.end();
		await done;
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

export function fileStream(row: Pick<FileRow, 'storedName'>, dir: string = uploadsDir()): Readable {
	return createReadStream(pathFor(row.storedName, dir));
}

/** Web ReadableStream for a Response body (streams from disk, no buffering). */
export function fileWebStream(row: FileRow, dir: string = uploadsDir()): ReadableStream {
	return Readable.toWeb(fileStream(row, dir)) as unknown as ReadableStream;
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
