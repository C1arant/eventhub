import type { DB } from './db';

export type DocKind = 'event' | 'person' | 'task';

// No-op stubs; Task 14 replaces these with the real full-text index.
export function indexDoc(_db: DB, _kind: DocKind, _refId: number, _eventId: number | null, _text: string): void {}
export function removeDoc(_db: DB, _kind: DocKind, _refId: number): void {}
