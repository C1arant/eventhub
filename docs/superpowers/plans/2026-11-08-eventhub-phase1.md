# EventHub Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted SvelteKit + SQLite web app for planning events (tasks, templates, people, call sheets) and running them live (run-of-show with real-time now/next), with crew logins and per-guest share links, deployable on Omarchy via Docker.

**Architecture:** One SvelteKit app (adapter-node). The server side is split into plain-function domain modules under `src/lib/server/*`, each unit-tested against a temp SQLite DB; routes are thin and call those modules. All permission checks go through one `can()` function. Live mode is a pure state machine persisted on every action and broadcast over SSE.

**Tech Stack:** Node 24 LTS (Docker) / Node ≥22 local, SvelteKit 2 + Svelte 5, TypeScript, Drizzle ORM + better-sqlite3, @node-rs/argon2, zod, Tailwind CSS v4 (@tailwindcss/vite), svelte-dnd-action, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-eventhub-phase1-design.md`

## Global Constraints

- All data lives under `DATA_DIR` (default `./data`): DB at `data/eventhub.db`, uploads at `data/uploads/<uuid>`.
- SQLite with `journal_mode = WAL` and `foreign_keys = ON`.
- Event types: `gig | club | theatre | corporate | esports | charity_stream | other`.
- Event status: `idea → confirmed → show_day → done`.
- Task priority `low | normal | high`; status `todo | doing | done`.
- Run-of-show item types: `act | changeover | break | speech | match | ad_read | donation_push | other`.
- Departments: `sound | lighting | video | stage`.
- Guest tokens: 32 random bytes, base64url; only a SHA-256 hash is stored. Default expiry: 7 days after event end date.
- Passwords: argon2id. Session cookie `eh_session`: HttpOnly, Secure (when not localhost dev), SameSite=Lax, 30-day sliding expiry.
- Login rate limit: after 5 failures per key (IP and email separately), lock for `2^(failures-5)` seconds, capped at 15 min.
- Upload max 25 MB.
- SSE heartbeat every 15 s.
- Dates are wall-clock strings: dates `YYYY-MM-DD`, times `HH:MM`, interpreted in the server `TZ` env (default `Europe/London`). Date arithmetic is calendar-day based, never by adding milliseconds.
- No default credentials; an empty DB shows owner setup.
- Every form/endpoint input is validated with zod.

## Review Focus

1. **Run-of-show past midnight** (club nights running to 06:00): items after 24:00 must display as `00:30 (+1)`, never negative or out of order → test in Task 9.
2. **Template date shift across a DST change** (e.g. event on 2026-10-25, UK clocks change): "3 days before" must land on 2026-10-22 exactly → test in Task 8.
3. **Deleting or editing the current item while live**: live state must stay valid (current moves to the next item, or finishes if none) → test in Task 10.
4. **Guest whose assignment is removed from the event**: their link must stop working immediately, just like a revoked one → test in Task 3.
5. **Starting live mode on a day with no items, or pressing Next on the last item**: start is rejected with a clear message; Next on the last item moves to `finished` → test in Task 10.

---

## File Structure

```
src/lib/server/db/schema.ts          all Drizzle tables
src/lib/server/db/index.ts           openDb(path), getDb() singleton, runs migrations
src/lib/server/db/test-db.ts         createTestDb() for tests (temp file, migrated)
drizzle/                             generated SQL migrations
src/lib/server/util/dates.ts         addDays, diffDays, timeToMin, minToClock
src/lib/server/util/tokens.ts        newToken(), hashToken()
src/lib/server/auth/password.ts      hashPassword, verifyPassword
src/lib/server/auth/sessions.ts      createSession, validateSession, deleteSession, deleteAllSessions
src/lib/server/auth/ratelimit.ts     checkLimit, recordFailure, recordSuccess
src/lib/server/auth/users.ts         createOwner, hasOwner, createInvite, acceptInvite, getUserByEmail
src/lib/server/auth/guests.ts        createGuestLink, resolveGuestToken, revokeGuestLink
src/lib/server/auth/can.ts           can(actor, action, resource) and Actor type
src/lib/server/events.ts             events + days queries
src/lib/server/tasks.ts              sections + tasks queries
src/lib/server/people.ts             people, assignments, call sheet
src/lib/server/templates/index.ts    saveAsTemplate, instantiateTemplate
src/lib/server/templates/starters.ts starter template data + seedStarters()
src/lib/server/ros.ts                run-of-show items + computeTimes
src/lib/server/live/machine.ts       pure reducer applyAction(state, items, action, now)
src/lib/server/live/store.ts         getLive, dispatch (persist + log + broadcast), report
src/lib/server/live/hub.ts           subscribe/publish per dayId
src/lib/server/files.ts              saveUpload, getFile, deleteFile
src/lib/server/search.ts             indexDoc, removeDoc, search
src/hooks.server.ts                  session/guest resolution, request IDs, error logging
src/routes/...                       pages listed per task
Dockerfile, docker-compose.yml, scripts/backup.sh, docs/deploy-omarchy.md
tests/unit/*.test.ts, tests/e2e/*.spec.ts
```

---

### Task 1: Scaffold, database schema and migrations

**Files:**
- Create: project scaffold (`package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.css`, `src/routes/+layout.svelte`), `drizzle.config.ts`, `src/lib/server/db/schema.ts`, `src/lib/server/db/index.ts`, `src/lib/server/db/test-db.ts`, `src/lib/server/util/dates.ts`, `src/lib/server/util/tokens.ts`, `.gitignore` (`node_modules`, `data`, `backups`, `.svelte-kit`, `build`, `test-results`)
- Test: `tests/unit/db.test.ts`, `tests/unit/dates.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path: string): DB` (migrates, sets pragmas), `getDb(): DB` (singleton on `${DATA_DIR}/eventhub.db`), `type DB = BetterSQLite3Database<typeof schema>`
  - `createTestDb(): DB` (fresh migrated temp file per call)
  - `addDays(date: string, n: number): string`, `diffDays(a: string, b: string): number` (b − a), `timeToMin('HH:MM'): number`, `minToClock(min: number): { clock: 'HH:MM', dayOffset: number }`
  - `newToken(): string` (32 bytes base64url), `hashToken(t: string): string` (sha256 hex)
  - Tables (all `id` integer PK autoincrement unless noted; timestamps are epoch ms integers):
    - `users(email unique, name, passwordHash, role 'owner'|'crew', personId → people null, createdAt)`
    - `invites(tokenHash unique, email, personId null, expiresAt, usedAt null)`
    - `sessions(id text PK = token hash, userId → users cascade, expiresAt)`
    - `loginAttempts(key text PK, failures, lockedUntil)`
    - `people(name, phone, email, notes, needs, tags text JSON array)`
    - `events(name, type, startDate, endDate, venue, address, status, notes, createdAt)`
    - `eventDays(eventId → events cascade, label, date, startTime, position)`
    - `taskSections(eventId cascade, name, position)`
    - `tasks(eventId cascade, sectionId → taskSections cascade, title, ownerUserId null, dueDate null, priority, status, notes, position)`
    - `assignments(eventId cascade, personId → people cascade, eventRole, callTime null, isShowCaller bool, unique(eventId, personId))`
    - `assignmentDayCalls(assignmentId cascade, dayId cascade, callTime)`
    - `guestLinks(assignmentId cascade, tokenHash unique, expiresAt, revokedAt null, liveAccess bool, contactPersonId null)`
    - `displayTokens(eventId cascade, tokenHash unique, revokedAt null, createdAt)`
    - `rosItems(dayId cascade, position, title, durationSec, type, hardStart text null, people text, notesSound, notesLighting, notesVideo, notesStage)`
    - `liveState(dayId PK → eventDays cascade, status 'idle'|'running'|'held'|'finished', currentItemId null, currentStartedAt null, heldAt null, version)`
    - `liveLog(dayId cascade, action, itemId null, at)`
    - `files(eventId cascade, assignmentId null cascade, name, mime, size, storedName, uploadedAt)`
    - `templates(name, type, data text JSON, createdAt)`
    - FTS5 virtual table `searchIndex(kind UNINDEXED, refId UNINDEXED, eventId UNINDEXED, text)` created in a custom SQL migration.

- [ ] **Step 1: Scaffold.** `npx sv create . --template minimal --types ts --no-add-ons`, then install deps from the Tech Stack line, add `@sveltejs/adapter-node`, Tailwind v4 via `@tailwindcss/vite`, scripts `dev`, `build`, `test` (`vitest run`), `test:e2e` (`playwright test`), `db:generate` (`drizzle-kit generate`). If `better-sqlite3` fails to install on this Node version, pin local dev to Node 24 LTS (record in README) rather than switch drivers.
- [ ] **Step 2: Write failing tests.**
  - `db.test.ts`: `createTestDb()` returns a DB where `PRAGMA journal_mode` = `wal`, `PRAGMA foreign_keys` = `1`, every table above exists, and inserting into `searchIndex` then `MATCH 'stage'` returns the row.
  - `dates.test.ts`: `addDays('2026-10-25', -3) === '2026-10-22'`; `addDays('2026-03-29', 1) === '2026-03-30'`; `diffDays('2026-12-30','2027-01-02') === 3`; `minToClock(1470)` → `{clock:'00:30', dayOffset:1}`; `timeToMin('23:45') === 1425`.
- [ ] **Step 3: Run `npm test`.** Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** schema, `openDb` (apply `drizzle/` migrations with drizzle's `migrate`), `getDb`, `createTestDb`, dates (use `Date.UTC` on parsed parts), tokens (`crypto.randomBytes`, `createHash('sha256')`). Run `npm run db:generate`, then add a custom migration (`drizzle-kit generate --custom`) creating the FTS5 table.
- [ ] **Step 5: Run `npm test`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: scaffold app, schema and migrations`.

---

### Task 2: Passwords, sessions and rate limiting

**Files:**
- Create: `src/lib/server/auth/password.ts`, `sessions.ts`, `ratelimit.ts`, `users.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `DB`, `newToken`, `hashToken`.
- Produces:
  - `hashPassword(p: string): Promise<string>`, `verifyPassword(hash: string, p: string): Promise<boolean>`
  - `createSession(db, userId: number, now = Date.now()): string` (returns raw token)
  - `validateSession(db, token: string, now = Date.now()): User | null` (extends expiry to now+30d when < 29 days remain)
  - `deleteSession(db, token)`, `deleteAllSessions(db, userId)`
  - `checkLimit(db, key: string, now): { allowed: boolean, retryAfterSec: number }`, `recordFailure(db, key, now)`, `recordSuccess(db, key)`
  - `hasOwner(db): boolean`, `createOwner(db, {email, name, password}): Promise<User>` (throws if an owner exists)
  - `createInvite(db, {email, personId?}, now): string` (raw token, 7-day expiry), `acceptInvite(db, token, {name, password}, now): Promise<User>` (crew role; throws on used/expired)
  - `getUserByEmail(db, email): User | null` (case-insensitive)
  - `type User = { id, email, name, role: 'owner'|'crew', personId: number|null }`

- [ ] **Step 1: Write failing tests:** password round-trip true/false; session valid → user, expired → null, after `deleteAllSessions` → null; sliding expiry extends; 5 failures still allowed, 6th check → `allowed:false, retryAfterSec:1`, 10 failures → retry 32; lockout capped at 900; `recordSuccess` resets; `createOwner` twice throws; invite accepted once, second accept throws, expired throws; `getUserByEmail('A@X.com')` finds `a@x.com`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/auth.test.ts` → FAIL.
- [ ] **Step 3: Implement** the functions above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: passwords, sessions, rate limiting, invites`.

---

### Task 3: Authorization and guest links

**Files:**
- Create: `src/lib/server/auth/can.ts`, `src/lib/server/auth/guests.ts`
- Test: `tests/unit/can.test.ts`, `tests/unit/guests.test.ts`

**Interfaces:**
- Produces:
  - `type Actor = { kind: 'owner', user } | { kind: 'crew', user } | { kind: 'guest', assignmentId, eventId, personId, liveAccess } | { kind: 'display', eventId } | { kind: 'anon' }`
  - `type Action = 'event:view'|'event:edit'|'event:create'|'tasks:edit'|'people:view'|'people:edit'|'callsheet:view'|'ros:view'|'ros:edit'|'live:view'|'live:control'|'files:upload'|'guest:manage'|'users:manage'|'settings:manage'`
  - `can(db, actor: Actor, action: Action, resource?: { eventId?: number, dayId?: number }): boolean`
  - Rules: owner → all. Crew → on events where `assignments` has their `personId`: event:view, tasks:edit, people:view, callsheet:view, ros:view, ros:edit, live:view, files:upload; `live:control` only if `isShowCaller`; never event:create/guest:manage/users:manage/settings:manage/people:edit. Guest → only `live:view` on their own event when `liveAccess`, nothing else (guest page data is served by a dedicated loader, not via these actions). Display → `live:view` on its event. Anon → nothing.
  - `createGuestLink(db, assignmentId, { liveAccess, contactPersonId?, expiresAt? }): string` (raw token; default expiry = end date + 7 days, 23:59 local)
  - `resolveGuestToken(db, token, now): Actor & {kind:'guest'} | null` (null if unknown, revoked, expired, or assignment gone)
  - `revokeGuestLink(db, linkId)`
  - `createDisplayToken(db, eventId): string`, `resolveDisplayToken(db, token): Actor & {kind:'display'} | null`

- [ ] **Step 1: Write failing tests:** a table-driven test covering every action × {owner, crew-assigned, crew-assigned-caller, crew-unassigned, guest, display, anon}. Guest: `can(guest,'callsheet:view')`, `'people:view'`, `'event:view'` all false. Guest link: resolves → actor; after revoke → null; after `expiresAt` → null; **after deleting the assignment → null (Review Focus 4)**; a token for event A gives `can(...,'live:view',{eventId:B})` false.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: authorization rules and guest/display tokens`.

---

### Task 4: Auth routes, app shell and error handling

**Files:**
- Create: `src/hooks.server.ts`, `src/app.d.ts` (`locals.actor`, `locals.requestId`), `src/routes/setup/+page.svelte|+page.server.ts`, `src/routes/login/…`, `src/routes/logout/+page.server.ts`, `src/routes/invite/[token]/…`, `src/routes/settings/…` (invite crew, list users, "log out everywhere"), `src/routes/+error.svelte`, `src/routes/(app)/+layout.svelte|+layout.server.ts` (nav: Dashboard, Events, People, My tasks, Settings; search box), `src/lib/server/guard.ts`
- Test: `tests/unit/guard.test.ts`

**Interfaces:**
- Consumes: Task 2 and Task 3 functions.
- Produces: `requireActor(locals, action, resource?)` in `guard.ts`: throws `redirect(303,'/login')` for anon, `error(403)` for logged-in-but-forbidden, `error(404, 'Link no longer valid')` for guests/displays. Every later route uses this.
- Hook behaviour: generate `requestId` (uuid) on each request; no owner → redirect everything except `/setup` and static assets to `/setup`; `/setup` redirects to `/login` once an owner exists; resolve `eh_session` cookie → owner/crew actor; `handleError` logs `{requestId, error}` and returns `{ message: 'Something went wrong', requestId }`.

- [ ] **Step 1: Write failing tests** for `requireActor`: anon → redirect to `/login`; crew forbidden → 403; guest forbidden → 404 with "Link no longer valid".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** guard, hooks and pages. Login uses `checkLimit` on `ip:<addr>` and `email:<lower>` and shows "Too many attempts, try again in N seconds". Mobile-first layout: bottom nav under 640 px.
- [ ] **Step 4: Run** `npm test` → PASS; then `npm run dev`, create owner at `/setup`, log out, log in, wrong password ×6 shows the lockout message.
- [ ] **Step 5: Commit** `feat: setup, login, invites, app shell, error handling`.

---

### Task 5: Events, event days and dashboard

**Files:**
- Create: `src/lib/server/events.ts`, `src/routes/(app)/+page.svelte|.server.ts` (dashboard), `src/routes/(app)/events/+page…` (list + new), `src/routes/(app)/events/[id]/+layout…` (tabs: Overview, Tasks, People, Run-of-show, Files), `src/routes/(app)/events/[id]/+page…` (overview/edit, days)
- Test: `tests/unit/events.test.ts`

**Interfaces:**
- Produces:
  - `createEvent(db, input: EventInput): number`, `updateEvent(db, id, input)`, `deleteEvent(db, id)`, `getEvent(db, id)`, `listEventsFor(db, actor): EventSummary[]` (crew: assigned events only), `addDay(db, eventId, {label, date, startTime}): number`, `updateDay`, `deleteDay`, `listDays(db, eventId)`
  - `EventInput` zod schema `eventInput` exported from the same file. `createEvent` also creates one default day (`label 'Show'`, date = startDate, startTime `'19:00'`).
  - `dashboard(db, actor, today: string): { upcoming: EventSummary[], myTasks: TaskRow[], today: EventSummary[] }`; `myTasks` = not-done tasks owned by the user with dueDate ≤ today + 7, overdue first. (`TaskRow` comes from Task 6; until then return `[]` and complete it there.)
  - Every mutation calls `indexDoc` (Task 14). Until Task 14, leave a no-op `indexDoc` stub in `search.ts`.

- [ ] **Step 1: Write failing tests:** create → default day exists; `endDate < startDate` rejected by `eventInput`; crew sees only assigned events; delete cascades days.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** module and pages (status shown as a coloured pill; type as an icon/label).
- [ ] **Step 4: Run** → PASS; manually create and edit an event in the browser.
- [ ] **Step 5: Commit** `feat: events, days, dashboard`.

---

### Task 6: Tasks, sections and My tasks

**Files:**
- Create: `src/lib/server/tasks.ts`, `src/routes/(app)/events/[id]/tasks/+page…`, `src/routes/(app)/tasks/+page…` (My tasks)
- Modify: `src/lib/server/events.ts` (`dashboard.myTasks`)
- Test: `tests/unit/tasks.test.ts`

**Interfaces:**
- Produces: `addSection(db, eventId, name)`, `renameSection`, `moveSection(db, id, newPosition)`, `deleteSection`, `addTask(db, eventId, sectionId, input: TaskInput)`, `updateTask`, `setTaskStatus(db, id, status)`, `deleteTask`, `listTasksBySection(db, eventId): { section, tasks: TaskRow[] }[]`, `myTasks(db, userId): TaskRow[]`. `TaskRow = { id, eventId, eventName, sectionId, title, ownerUserId, ownerName, dueDate, priority, status, notes }`.
- Due dates in the UI accept either a date or "N days before event start"; the route converts to an absolute date with `addDays(event.startDate, -N)`.

- [ ] **Step 1: Write failing tests:** tasks group by section in position order; `setTaskStatus` persists; `myTasks` excludes other users' tasks and done tasks, sorted by dueDate with nulls last; deleting a section deletes its tasks.
- [ ] **Step 2–4:** Run → FAIL, implement (one-tap checkbox uses a form action with progressive enhancement), run → PASS.
- [ ] **Step 5: Commit** `feat: tasks, sections, my tasks`.

---

### Task 7: People, assignments, call sheet and guest link management

**Files:**
- Create: `src/lib/server/people.ts`, `src/routes/(app)/people/+page…` (directory + search by tag), `src/routes/(app)/people/[id]/+page…` (detail + event history), `src/routes/(app)/events/[id]/people/+page…` (assign, roles, call times, show-caller toggle, create/revoke guest link with copy button, send crew invite), `src/routes/(app)/events/[id]/callsheet/+page…` (print CSS)
- Test: `tests/unit/people.test.ts`

**Interfaces:**
- Produces: `createPerson(db, input: PersonInput)`, `updatePerson`, `deletePerson`, `listPeople(db, {tag?, q?})`, `getPerson(db, id)` (with `history: {eventId, eventName, startDate, eventRole}[]`), `assign(db, eventId, personId, {eventRole, callTime?, isShowCaller?})`, `updateAssignment`, `unassign(db, assignmentId)`, `setDayCallTime(db, assignmentId, dayId, callTime)`, `callSheet(db, eventId): CallSheetRow[]` (`{name, eventRole, phone, callTime, dayCalls: {dayLabel, callTime}[], needs}` sorted by callTime then name), `listGuestLinks(db, eventId)`.
- Raw guest link URLs are shown only once, right after creation (the DB holds only the hash); the UI says so.

- [ ] **Step 1: Write failing tests:** assigning the same person twice is rejected; `callSheet` ordering; person history lists events newest first; `unassign` makes their guest link resolve to null.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: people, assignments, call sheet, guest links UI`.

---

### Task 8: Templates and starter templates

**Files:**
- Create: `src/lib/server/templates/index.ts`, `src/lib/server/templates/starters.ts`, `src/routes/(app)/templates/+page…` (list, delete), plus a "Save as template" action on event overview and a "From template" option on new event
- Test: `tests/unit/templates.test.ts`

**Interfaces:**
- Consumes: events, tasks, and ros modules (Task 9's `addItem`, `listItems`). **Execute this task after Task 9.**
- Produces:
  - `type TemplateData = { days: { label, offsetDays, startTime, items: RosItemInput[] }[], sections: { name, tasks: { title, priority, notes, dueOffsetDays: number | null }[] }[] }` (`dueOffsetDays` = `diffDays(event.startDate, task.dueDate)`, negative = before)
  - `saveAsTemplate(db, eventId, name): number`, `instantiateTemplate(db, templateId, { name, startDate }): number` (new eventId; endDate = startDate + original span), `seedStarters(db)` (idempotent; runs at startup when `templates` is empty)
  - Starters: one per event type, 6–12 tasks each, a skeleton run-of-show. Charity stream must include "Test stream key", "Donation page live", "Overlay check", "Schedule raid". Gig must include "Advance venue", "Confirm rider", "Send set times", "Guest list".

- [ ] **Step 1: Write failing tests:** save then instantiate on 2026-10-25 → a task that was 3 days before the original lands on **2026-10-22 (Review Focus 2)**; people and files are not copied; days keep their offsets; `seedStarters` twice → still 7 templates.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: templates and starter templates`.

---

### Task 9: Run-of-show editor and time calculation

**Files:**
- Create: `src/lib/server/ros.ts`, `src/routes/(app)/events/[id]/ros/+page…` (day picker, item list with drag via svelte-dnd-action plus up/down buttons, inline edit), `src/routes/(app)/events/[id]/ros/[dayId]/print/+page…` (`?dept=sound|lighting|video|stage`)
- Test: `tests/unit/ros.test.ts`

**Interfaces:**
- Produces: `addItem(db, dayId, input: RosItemInput): number`, `updateItem`, `deleteItem`, `moveItem(db, itemId, newPosition)` (renumbers positions in one transaction), `listItems(db, dayId): RosItem[]`, `computeTimes(dayStartTime: string, items: RosItem[]): TimedItem[]` where `TimedItem = RosItem & { startMin: number, endMin: number, clock: string, dayOffset: number, conflict: boolean }`.
- `computeTimes` algorithm: `cursor = timeToMin(dayStart)`. For each item: if `hardStart`, `h = timeToMin(hardStart)`, and while `h < cursor - 720` add 1440 (so a hard start of 01:00 after a 23:00 cursor means the next day); `conflict = h < cursor`; `start = hardStart ? h : cursor`; `end = start + durationSec/60`; `cursor = end`. Clock/dayOffset come from `minToClock(start)`.

- [ ] **Step 1: Write failing tests:** a 22:00 start with items of 90, 60, 60 min → clocks `22:00`, `23:30`, `00:30 (+1)` (**Review Focus 1**); a hard start 02:00 after a cursor of 01:30 → starts 02:00 (+1), no conflict; a hard start earlier than the cursor → `conflict: true`; `moveItem` from 0→2 keeps positions contiguous 0..n-1.
- [ ] **Step 2–4:** Run → FAIL, implement (show a conflict as an amber warning in the UI), run → PASS.
- [ ] **Step 5: Commit** `feat: run-of-show editor and timing`.

---

### Task 10: Live state machine and persistence

**Files:**
- Create: `src/lib/server/live/machine.ts`, `src/lib/server/live/store.ts`, `src/lib/server/live/hub.ts`
- Modify: `src/lib/server/ros.ts` (`deleteItem` calls `onItemDeleted`)
- Test: `tests/unit/live-machine.test.ts`, `tests/unit/live-store.test.ts`

**Interfaces:**
- Produces:
  - `type LiveState = { status: 'idle'|'running'|'held'|'finished', currentItemId: number|null, currentStartedAt: number|null, heldAt: number|null, version: number }`
  - `type LiveAction = {type:'start'}|{type:'next'}|{type:'back'}|{type:'skip'}|{type:'hold'}|{type:'resume'}|{type:'finish'}|{type:'insertQuickItem', title: string, durationSec: number}`
  - `applyAction(state, itemIds: number[], action, now): { state: LiveState } | { error: 'empty'|'invalid' }` (pure; `insertQuickItem` is handled in the store, which inserts the item after the current one then calls `next`)
  - Semantics: `start` (from idle, needs ≥1 item, else `empty`) → running on the first item. `next`/`skip` → the following item, `currentStartedAt = now`; on the last item → `finished`. (`skip` differs only in the log.) `back` → the previous item, restarted at now. `hold` → `heldAt = now`. `resume` → `currentStartedAt += now - heldAt`, `heldAt = null`. `finish` → finished. Each success increments `version`.
  - `getLive(db, dayId): LiveState` (idle default), `dispatch(db, dayId, action, clientVersion, now = Date.now()): { ok: true, state } | { ok: false, reason: 'conflict'|'empty'|'invalid', state }` — in one transaction: compare versions, apply, save, append `liveLog`; then `publish(dayId, snapshot)`.
  - `onItemDeleted(db, dayId, itemId, now)`: if it's the current item → the current moves to the next item by position (started now), or finished if none; version++; publish (**Review Focus 3**).
  - `liveSnapshot(db, dayId, now): { state, now: TimedItem|null, next: TimedItem|null, after: TimedItem|null, remainingSec: number|null, overUnderSec: number }`, where `overUnderSec = (currentStartedAt + max(elapsed, duration)) − plannedEnd(current)`, in seconds, with the planned end derived from `computeTimes` on the day's date (positive = late).
  - `report(db, dayId): { itemId, title, plannedStart, actualStart, plannedDurSec, actualDurSec }[]` from `liveLog`.
  - `hub.subscribe(dayId, send: (data: string) => void): () => void`, `hub.publish(dayId, payload: object)`.

- [ ] **Step 1: Write failing tests:**
  - machine: start on empty → `empty` (**Review Focus 5**); next on the last item → finished; hold then resume 30 s later shifts `currentStartedAt` by 30 000; back on the first item → `invalid`.
  - store: two dispatches with the same `clientVersion` → the second returns `conflict` and the item advances only once; state survives re-opening the DB file (restart); deleting the current item moves to the next; deleting the current last item → finished; the log contains one row per applied action; `overUnderSec` is 270 when an item started 4:30 late.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: live state machine, persistence, hub`.

---

### Task 11: Live views and SSE

**Files:**
- Create: `src/routes/live/[dayId]/stream/+server.ts` (SSE), `src/routes/live/[dayId]/action/+server.ts` (POST JSON `{action, version}`), `src/routes/(app)/events/[id]/live/[dayId]/+page…` (caller or read-only view by permission), `src/routes/display/[token]/[dayId]/+page…` (stage display), `src/routes/(app)/events/[id]/live/[dayId]/report/+page…`, `src/lib/components/LiveBoard.svelte`, `src/lib/live-client.ts`
- Test: `tests/unit/live-client.test.ts`

**Interfaces:**
- Consumes: `dispatch`, `liveSnapshot`, `hub`, `can(...,'live:view'|'live:control')`.
- Produces:
  - SSE: on connect, send `event: state` with the full snapshot; on each publish, re-send the full snapshot (simple and small; it satisfies "diffs" in spirit); `: ping` every 15 s; unsubscribe on abort. Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
  - Action endpoint: 403 without `live:control`; 409 `{reason:'conflict', state}` on conflict, which the UI shows as the toast "Already advanced".
  - `createLiveClient(url, onState, onStatus: (s: 'connected'|'reconnecting') => void)`: EventSource with backoff 1 s, 2 s, 4 s … max 15 s; a reconnect receives the full state.
  - Display page: big-text NOW/NEXT/timer/over-under, dark background, no nav; `?obs=1` makes the background transparent. The owner's live page has a "Stage display link" button that calls `createDisplayToken` and shows the URL once, with a revoke option.
  - The guest live view is reached from the guest page (Task 12) at `/g/[token]/live/[dayId]`, which reuses `LiveBoard`.
  - The timer counts down client-side from `remainingSec` using the server `now` to correct for clock skew.

- [ ] **Step 1: Write failing test** for the backoff sequence of `createLiveClient` (mock EventSource): delays 1000, 2000, 4000, 8000, 15000, 15000; status goes `reconnecting` → `connected` on open.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS. Manually: open the caller view and a second browser; press Next; the second browser updates in about a second.
- [ ] **Step 5: Commit** `feat: live views, SSE stream, stage display, report`.

---

### Task 12: Guest page

**Files:**
- Create: `src/routes/g/[token]/+page…`, `src/routes/g/[token]/live/[dayId]/+page…`, `src/lib/server/guest-view.ts`
- Test: `tests/unit/guest-view.test.ts`

**Interfaces:**
- Produces: `guestView(db, actor: GuestActor): { eventName, venue, address, days: {label, date}[], callTime, dayCalls, mySlots: TimedItem[], contact: {name, phone} | null, files: {id, name}[], liveDays: number[] }`. `mySlots` = items whose `people` text contains the person's name (case-insensitive). Files = only those with `assignmentId` equal to theirs. Download through `/g/[token]/files/[fileId]` with an ownership check.
- An invalid/expired/revoked token renders "This link is no longer valid" (404) and does not reveal which case it is.

- [ ] **Step 1: Write failing tests:** the result has no other people's phone numbers (assert that no other assigned person's phone appears in `JSON.stringify(result)`); file lists exclude other assignments' files; `liveDays` is empty when `liveAccess` is false.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: guest page`.

---

### Task 13: File uploads

**Files:**
- Create: `src/lib/server/files.ts`, `src/routes/(app)/events/[id]/files/+page…` (upload with an optional "for guest" select), `src/routes/files/[fileId]/+server.ts` (authenticated download)
- Test: `tests/unit/files.test.ts`

**Interfaces:**
- Produces: `saveUpload(db, { eventId, assignmentId?, file: File }): Promise<number>` (rejects > 25 MB with `'File too large (max 25 MB)'`; writes to a temp name then renames; deletes the temp file on failure), `getFile(db, id)`, `fileStream(row)`, `deleteFile(db, id)` (removes the row and the disk file), `listFiles(db, eventId)`.
- Set `BODY_SIZE_LIMIT=26214400` in env for adapter-node.

- [ ] **Step 1: Write failing tests:** a 26 MB upload rejected with no file left in the uploads dir; save → row + file exist; delete removes both.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: file uploads`.

---

### Task 14: Search

**Files:**
- Modify: `src/lib/server/search.ts` (replace the stub), events/tasks/people modules (call `indexDoc`/`removeDoc` on mutations), `src/routes/(app)/+layout.svelte` (search box)
- Create: `src/routes/(app)/search/+page…`
- Test: `tests/unit/search.test.ts`

**Interfaces:**
- Produces: `indexDoc(db, kind: 'event'|'person'|'task', refId, eventId: number|null, text)`, `removeDoc(db, kind, refId)`, `search(db, actor, q: string): { kind, refId, eventId, title, snippet }[]` (max 30; crew results are filtered to assigned events, and to people on those events; the query is sanitized by quoting each term and adding a `*` prefix match).

- [ ] **Step 1: Write failing tests:** a person "Jess Lighting" is found by `jes`; a task on an unassigned event is hidden from crew; a query with quotes/parentheses does not throw.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat: search`.

---

### Task 15: End-to-end show-day test

**Files:**
- Create: `playwright.config.ts` (webServer: `npm run build && node build` with `DATA_DIR` set to a fresh temp dir and `ORIGIN=http://localhost:4173`, `PORT=4173`), `tests/e2e/showday.spec.ts`

- [ ] **Step 1: Write the test:** owner setup → new event from the "Gig" starter on a date 7 days from now → add a person "Sam" and send a crew invite → accept the invite in a second context and set a password → owner marks Sam as show caller → add guest "Alex" with live access and capture the link → Sam opens live and presses Start then Next → the owner context and the guest context both show the second item as NOW within 3 s → owner revokes Alex's link → the guest reload shows "This link is no longer valid".
- [ ] **Step 2: Run** `npx playwright install chromium && npm run test:e2e` → fix failures in the owning modules until it passes.
- [ ] **Step 3: Commit** `test: end-to-end show-day flow`.

---

### Task 16: Docker, deployment docs and backups

**Files:**
- Create: `Dockerfile` (multi-stage; `node:24-bookworm-slim`; build with `npm ci && npm run build`, prune dev deps; run `node build` as a non-root user; `ENV DATA_DIR=/app/data PORT=3000 BODY_SIZE_LIMIT=26214400 TZ=Europe/London`; `HEALTHCHECK` on `/healthz`), `src/routes/healthz/+server.ts` (returns 200 `ok` after a `SELECT 1`), `docker-compose.yml`, `.env.example`, `scripts/backup.sh`, `deploy/eventhub-backup.service`, `deploy/eventhub-backup.timer`, `docs/deploy-omarchy.md`, `README.md`
- `docker-compose.yml`: service `app` (build `.`, `restart: unless-stopped`, `ports: 127.0.0.1:3000:3000`, `volumes: ./data:/app/data`, `env_file: .env`); service `cloudflared` (`profiles: [cloudflare]`, `cloudflare/cloudflared:latest`, `command: tunnel run`, env `TUNNEL_TOKEN`); service `tailscale` (`profiles: [tailscale]`, `tailscale/tailscale:latest`, state volume, `TS_AUTHKEY`, `TS_SERVE_CONFIG` for Funnel to `app:3000`).
- `.env.example`: `ORIGIN=https://events.example.com`, `TZ=Europe/London`, `TUNNEL_TOKEN=`, `TS_AUTHKEY=`.
- `scripts/backup.sh`: `sqlite3 data/eventhub.db ".backup backups/$(date +%F)/eventhub.db"` (falls back to `docker compose exec app node -e` with better-sqlite3's `.backup()` if `sqlite3` is missing) + `cp -r data/uploads`, then deletes backup folders older than 14 days.
- `docs/deploy-omarchy.md` sections: install Docker (`sudo pacman -S docker docker-compose && sudo systemctl enable --now docker.service`, add the user to the `docker` group), copy or clone the repo, `cp .env.example .env`, `docker compose up -d --build`, open `http://localhost:3000/setup`; option A Cloudflare Tunnel (dashboard steps, set `ORIGIN`, `docker compose --profile cloudflare up -d`); option B Tailscale Funnel; enable the backup timer (`systemctl --user enable --now eventhub-backup.timer`); updating (`git pull && docker compose up -d --build`); restoring from backup.

- [ ] **Step 1: Write** the files above.
- [ ] **Step 2: Verify locally:** `npm run build && node build` with `PORT=3000`, then `curl localhost:3000/healthz` → `ok`. Docker is not installed on the dev Windows PC, so `docker compose up` is verified on Omarchy with the user; record that in the README as a manual check.
- [ ] **Step 3: Run** `npm test && npm run test:e2e` → all pass.
- [ ] **Step 4: Commit** `feat: docker, deployment docs, backups`.
