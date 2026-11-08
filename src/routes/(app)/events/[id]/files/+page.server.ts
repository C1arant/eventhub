import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { can } from '#lib/server/auth/can.js';
import { getDb } from '#lib/server/db/index.js';
import { getEvent } from '#lib/server/events.js';
import { requireActor } from '#lib/server/guard.js';
import { deleteFile, getFile, listFiles, saveUpload, TOO_LARGE } from '#lib/server/files.js';
import { assignmentInEvent, listEventPeople } from '#lib/server/people.js';

const eventId = (p: { id: string }) => {
	const id = Number(p.id);
	if (!Number.isInteger(id) || id < 1) error(404, 'Event not found');
	return id;
};

export const load = ({ locals, params }) => {
	const id = eventId(params);
	const db = getDb();
	const actor = requireActor(locals, 'event:view', { eventId: id });
	if (!getEvent(db, id)) error(404, 'Event not found');
	return {
		canUpload: can(db, actor, 'files:upload', { eventId: id }),
		canDelete: can(db, actor, 'event:edit', { eventId: id }),
		files: listFiles(db, id).map((f) => ({
			id: f.id, name: f.name, size: f.size, uploadedAt: f.uploadedAt, guestName: f.guestName
		})),
		// Names only: private contact details are never needed here.
		assignments: listEventPeople(db, id, { includePrivate: false }).map((a) => ({
			id: a.assignmentId, name: a.name
		}))
	};
};

const forGuest = z.preprocess(
	(v) => (v === '' || v === undefined ? null : v),
	z.coerce.number().int().positive().nullable()
);

export const actions = {
	upload: async ({ locals, params, request }) => {
		const id = eventId(params);
		requireActor(locals, 'files:upload', { eventId: id });
		const db = getDb();
		const fd = await request.formData();
		const file = fd.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a file to upload' });
		const parsed = forGuest.safeParse(fd.get('assignmentId') ?? '');
		if (!parsed.success) return fail(400, { error: 'Choose a valid guest' });
		if (parsed.data !== null && !assignmentInEvent(db, id, parsed.data)) error(404, 'Assignment not found');
		try {
			await saveUpload(db, { eventId: id, assignmentId: parsed.data, file });
		} catch (e) {
			if (e instanceof Error && (e.message === TOO_LARGE || e.message === 'File is empty'))
				return fail(400, { error: e.message });
			throw e;
		}
		return { ok: true };
	},
	delete: async ({ locals, params, request }) => {
		const id = eventId(params);
		requireActor(locals, 'event:edit', { eventId: id });
		const db = getDb();
		const fd = await request.formData();
		const fileId = Number(fd.get('fileId'));
		const row = Number.isInteger(fileId) && fileId > 0 ? getFile(db, fileId) : undefined;
		if (!row || row.eventId !== id) error(404, 'File not found');
		deleteFile(db, row.id);
		return { ok: true };
	}
};
