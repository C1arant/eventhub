# EventHub — Phase 1 Design

**Date:** 2026-11-08
**Status:** Approved in conversation, awaiting written-spec review

## 1. Purpose

A self-hosted web app for planning, managing and running live events, hosted on the owner's Linux PC (Omarchy, Arch-based) and reachable from phones over the internet.

Event types covered: live music / gigs, club nights / parties, theatre / stage shows, corporate / conferences, esports events, Twitch charity streams.

Users: the owner, their crew, and outside people (artists, clients, players, volunteers) who see only their own information.

### Success criteria (Phase 1)

- An event can be created from a template in under a minute, with all task due dates shifted to fit the new event date.
- Crew can see and tick off their tasks from a phone.
- On show day, pressing **Next** in live mode updates every connected viewer (crew, guests, stage display) within ~1 second.
- A guest link shows only that guest's info and can be revoked instantly.
- Everything (DB + uploads) lives in one `data/` folder; backup is copying that folder.

### Phased roadmap

| Phase | Scope |
|---|---|
| **1 (this spec)** | Events, tasks/checklists, templates, people/contacts, call sheets, run-of-show, live mode, guest share links, hosting |
| 2 | Budget (costs, income, donations raised), gear inventory with check-in/out |
| 3 | Type-specific extras: stage plots/riders, theatre cue sheets, esports brackets, Twitch/charity donation goals and overlays |

Phase 2 and 3 are out of scope here and get their own specs.

## 2. Architecture and hosting

- **Framework:** SvelteKit (TypeScript) with `@sveltejs/adapter-node` — one codebase for UI and server.
- **Database:** SQLite file at `data/eventhub.db`, accessed via Drizzle ORM (`better-sqlite3` driver). WAL mode enabled.
- **Live updates:** Server-Sent Events (SSE). An in-process broadcast hub keyed by event-day ID pushes live-state changes to subscribers.
- **Uploads:** stored at `data/uploads/<uuid>`; metadata in DB. Max 25 MB per file.
- **Runtime:** Docker Compose. Services:
  - `app` — the SvelteKit Node server, `restart: unless-stopped`, mounts `./data`.
  - `tunnel` (optional profile) — either `cloudflared` (Cloudflare Tunnel, needs a domain on Cloudflare) or Tailscale Funnel (free `*.ts.net` address). Setup docs cover both; the owner chooses at deploy time.
- **Backups:** a nightly job (systemd timer on the host, documented) runs SQLite's online backup into `backups/YYYY-MM-DD/` along with a copy of `data/uploads/`, keeping 14 days.
- **Scale assumption:** one organisation, tens of users. If the PC is off, the app is offline (acceptable). The container can move to a VPS later unchanged.

### Code layout

```
src/lib/server/db/        schema.ts, migrations, query modules per domain
src/lib/server/auth/      password hashing, sessions, roles, guest tokens, rate limit
src/lib/server/live/      live-state machine + SSE broadcast hub
src/lib/server/templates/ save-as-template and instantiate-with-date-shift
src/lib/components/       shared UI
src/routes/               dashboard, events, people, tasks, live, guest (/g/[token]), settings
docker-compose.yml, Dockerfile, docs/deploy-omarchy.md
```

Each server module exposes plain functions with typed inputs/outputs and is tested independently of the routes.

## 3. Accounts, roles and guest access

| Role | Login | Access |
|---|---|---|
| **Owner** | Email + password | Everything, incl. users and settings |
| **Crew** | Email + password, onboarded via invite link from owner | Events they're assigned to: view/edit tasks, people on the event, run-of-show, live view. Can run live mode only if given the per-event **Show caller** flag |
| **Guest** | Per-person, per-event link `/g/<token>` — no account | Read-only: own call time, own run-of-show slots, venue/address, a designated contact, files attached for them, and live now/next view if enabled for that link |

- Guest tokens: 32 bytes random, URL-safe; stored hashed. Owner can revoke or set expiry (default: 7 days after event end). Revoked/expired → generic "link no longer valid" page.
- Guests can never edit anything, see other people's contact details, or see budget data (Phase 2).
- Passwords hashed with argon2id. Sessions: random token in an HttpOnly, Secure, SameSite=Lax cookie, 30-day sliding expiry, stored in DB; "log out everywhere" in settings.
- Login rate limiting: per IP + per email, exponential backoff after 5 failures.
- First launch with an empty DB shows an owner-setup screen. No default credentials.
- All server routes enforce permissions in a single authorization module (`can(user, action, resource)`), never only in the UI.

Out of scope for Phase 1: 2FA, OAuth (Google/Discord), field-level permissions.

## 4. Events, tasks, templates, people

### Events
- Fields: name, type (gig | club | theatre | corporate | esports | charity_stream | other), start/end dates, venue name, address, status (idea → confirmed → show_day → done), notes (markdown), attachments.
- An event has one or more **days** (e.g. Load-in, Show, Load-out); each day owns a run-of-show.
- **Dashboard:** upcoming events, my overdue/due-soon tasks, today's events.

### Tasks and checklists
- Fields: title, section, owner (person with crew login, optional), due date — either absolute or relative ("N days before event start"), priority (low/normal/high), status (todo/doing/done), notes.
- Sections are free-text names per event, ordered.
- Views: event task board grouped by section; global "My tasks".
- Mobile-friendly one-tap completion.

### Templates
- "Save as template" copies sections, tasks (with due dates converted to relative offsets), event days, and run-of-show items (times kept relative to day start). No people or files are copied.
- "New event from template" asks for start date and name, then instantiates everything with shifted dates.
- Seeded starter templates, one per event type (e.g. charity stream: test stream key, donation page live, overlay check, schedule raid; gig: advance venue, confirm rider, set times, guest list). They are editable.

### People
- Global contacts directory: name, role tags (multi), phone, email, notes, dietary/access needs.
- **Event assignment:** person + event role + call time (+ optional per-day call times) + access: none | guest link | crew login.
- **Call sheet** per event: everyone assigned, roles, call times, phone numbers; printable (print CSS) and mobile view. Visible to owner and crew only.
- Person page lists event history.

### Search
Single search box over events, people and tasks (SQLite FTS5).

## 5. Run-of-show and live mode

### Planning
- Items per event day, ordered: title, planned start (computed), duration, type tag (act, changeover, break, speech, match, ad_read, donation_push, other), people involved, department notes (sound, lighting, video/stream, stage).
- Drag to reorder; start times are derived from the day's start time + cumulative durations. An item may be marked **hard start** (fixed clock time), and the following items flow from it.
- Print/PDF view with a department filter.

### Live state machine
State per event day: `{ status: idle | running | held | finished, currentItemId, currentStartedAt, version }`.

Actions (show caller only): `start`, `next`, `back`, `skip`, `hold`, `resume`, `insertQuickItem(title, duration)`, `finish`.

- Each action carries the client's last-seen `version`. The server applies it only if the versions match (optimistic concurrency), then increments `version`. A mismatch → response "Already advanced", and the client resyncs. This prevents a double-press skipping two cues.
- Every applied action writes a row to `live_log (dayId, action, itemId, at)` and the new state to the DB before broadcasting, so a restart resumes exactly.
- Derived values: time remaining on current item, over/under versus plan (sum of actual vs planned up to now), shown in red when late.

### Views
- **Caller view:** NOW / NEXT / AFTER, controls, over/under.
- **Crew/guest live view:** read-only NOW/NEXT/AFTER + timer + over/under.
- **Stage display:** big-text full-screen, usable as an OBS browser source; access by crew login or a dedicated display token.
- **Post-show report:** planned vs actual per item from `live_log`.

### Connectivity
- The SSE stream sends the full state on connect, then diffs. Clients auto-reconnect with backoff and show a "Reconnecting…" badge while disconnected; on reconnect they get the full state.
- A heartbeat every 15 s keeps proxies/tunnels from closing idle streams.

## 6. Error handling

- Input validation with zod on every form action/endpoint; field-level errors shown inline.
- Permission failures return 403 (crew) or a generic invalid-link page (guest); they never leak whether a resource exists.
- Unexpected errors are logged server-side with a request ID; the user sees a friendly error page with that ID.
- Upload failures (too large, disk) are reported clearly; no partial files are left behind.

## 7. Testing

- **Unit (Vitest):** authorization rules (especially guest isolation), template date shifting, run-of-show time calculation incl. hard starts, live state machine transitions incl. version-conflict double-press, guest token expiry/revocation.
- **Integration:** DB query modules against a temp SQLite file.
- **End-to-end (Playwright):** create event from template → assign crew + guest → caller runs live mode → second crew session and guest session receive updates → revoke guest link → guest blocked.

## 8. Deliverables

- Source repo `eventhub/` with README.
- `Dockerfile`, `docker-compose.yml`.
- `docs/deploy-omarchy.md`: install Docker on Omarchy, first run, owner setup, Cloudflare Tunnel option, Tailscale Funnel option, backup timer, updating.
