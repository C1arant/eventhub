import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });

export const people = sqliteTable('people', {
	id: id(),
	name: text('name').notNull(),
	phone: text('phone').notNull().default(''),
	email: text('email').notNull().default(''),
	notes: text('notes').notNull().default(''),
	needs: text('needs').notNull().default(''),
	tags: text('tags').notNull().default('[]') // JSON array of strings
});

export const users = sqliteTable('users', {
	id: id(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['owner', 'crew'] }).notNull(),
	personId: integer('person_id').references(() => people.id),
	createdAt: integer('created_at').notNull()
});

export const invites = sqliteTable('invites', {
	id: id(),
	tokenHash: text('token_hash').notNull().unique(),
	email: text('email').notNull(),
	personId: integer('person_id').references(() => people.id),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at')
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(), // token hash
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

export const loginAttempts = sqliteTable('login_attempts', {
	key: text('key').primaryKey(),
	failures: integer('failures').notNull().default(0),
	lockedUntil: integer('locked_until').notNull().default(0)
});

export const events = sqliteTable('events', {
	id: id(),
	name: text('name').notNull(),
	type: text('type').notNull(),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	venue: text('venue').notNull().default(''),
	address: text('address').notNull().default(''),
	status: text('status').notNull().default('idea'),
	notes: text('notes').notNull().default(''),
	createdAt: integer('created_at').notNull()
});

export const eventDays = sqliteTable('event_days', {
	id: id(),
	eventId: integer('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	date: text('date').notNull(),
	startTime: text('start_time').notNull().default('00:00'),
	position: integer('position').notNull().default(0)
});

export const taskSections = sqliteTable('task_sections', {
	id: id(),
	eventId: integer('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	position: integer('position').notNull().default(0)
});

export const tasks = sqliteTable('tasks', {
	id: id(),
	eventId: integer('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	sectionId: integer('section_id')
		.notNull()
		.references(() => taskSections.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	ownerUserId: integer('owner_user_id').references(() => users.id),
	dueDate: text('due_date'),
	priority: text('priority').notNull().default('normal'),
	status: text('status').notNull().default('todo'),
	notes: text('notes').notNull().default(''),
	position: integer('position').notNull().default(0)
});

export const assignments = sqliteTable(
	'assignments',
	{
		id: id(),
		eventId: integer('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		personId: integer('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		eventRole: text('event_role').notNull().default(''),
		callTime: text('call_time'),
		isShowCaller: integer('is_show_caller', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [unique().on(t.eventId, t.personId)]
);

export const assignmentDayCalls = sqliteTable('assignment_day_calls', {
	id: id(),
	assignmentId: integer('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' }),
	dayId: integer('day_id')
		.notNull()
		.references(() => eventDays.id, { onDelete: 'cascade' }),
	callTime: text('call_time').notNull()
});

export const guestLinks = sqliteTable('guest_links', {
	id: id(),
	assignmentId: integer('assignment_id')
		.notNull()
		.references(() => assignments.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: integer('expires_at').notNull(),
	revokedAt: integer('revoked_at'),
	liveAccess: integer('live_access', { mode: 'boolean' }).notNull().default(false),
	contactPersonId: integer('contact_person_id').references(() => people.id)
});

export const displayTokens = sqliteTable('display_tokens', {
	id: id(),
	eventId: integer('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	revokedAt: integer('revoked_at'),
	createdAt: integer('created_at').notNull()
});

export const rosItems = sqliteTable('ros_items', {
	id: id(),
	dayId: integer('day_id')
		.notNull()
		.references(() => eventDays.id, { onDelete: 'cascade' }),
	position: integer('position').notNull().default(0),
	title: text('title').notNull(),
	durationSec: integer('duration_sec').notNull().default(0),
	type: text('type').notNull().default('act'),
	hardStart: text('hard_start'),
	people: text('people').notNull().default(''),
	notesSound: text('notes_sound').notNull().default(''),
	notesLighting: text('notes_lighting').notNull().default(''),
	notesVideo: text('notes_video').notNull().default(''),
	notesStage: text('notes_stage').notNull().default('')
});

export const liveState = sqliteTable('live_state', {
	dayId: integer('day_id')
		.primaryKey()
		.references(() => eventDays.id, { onDelete: 'cascade' }),
	status: text('status', { enum: ['idle', 'running', 'held', 'finished'] })
		.notNull()
		.default('idle'),
	currentItemId: integer('current_item_id'),
	currentStartedAt: integer('current_started_at'),
	heldAt: integer('held_at'),
	version: integer('version').notNull().default(0)
});

export const liveLog = sqliteTable('live_log', {
	id: id(),
	dayId: integer('day_id')
		.notNull()
		.references(() => eventDays.id, { onDelete: 'cascade' }),
	action: text('action').notNull(),
	itemId: integer('item_id'),
	at: integer('at').notNull()
});

export const files = sqliteTable('files', {
	id: id(),
	eventId: integer('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	assignmentId: integer('assignment_id').references(() => assignments.id, {
		onDelete: 'cascade'
	}),
	name: text('name').notNull(),
	mime: text('mime').notNull(),
	size: integer('size').notNull(),
	storedName: text('stored_name').notNull(),
	uploadedAt: integer('uploaded_at').notNull()
});

export const templates = sqliteTable('templates', {
	id: id(),
	name: text('name').notNull(),
	type: text('type').notNull(),
	data: text('data').notNull(), // JSON
	createdAt: integer('created_at').notNull()
});
