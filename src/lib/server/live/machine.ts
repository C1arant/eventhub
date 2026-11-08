export type LiveStatus = 'idle' | 'running' | 'held' | 'finished';

export type LiveState = {
	status: LiveStatus;
	currentItemId: number | null;
	currentStartedAt: number | null;
	heldAt: number | null;
	version: number;
};

export type LiveAction =
	| { type: 'start' }
	| { type: 'next' }
	| { type: 'back' }
	| { type: 'skip' }
	| { type: 'hold' }
	| { type: 'resume' }
	| { type: 'finish' }
	| { type: 'insertQuickItem'; title: string; durationSec: number };

export type ApplyResult = { state: LiveState } | { error: 'empty' | 'invalid' };

const INVALID = { error: 'invalid' } as const;

const finished = (s: LiveState): LiveState => ({ status: 'finished', currentItemId: null, currentStartedAt: null, heldAt: null, version: s.version + 1 });
const onItem = (s: LiveState, id: number, now: number): LiveState => ({ status: 'running', currentItemId: id, currentStartedAt: now, heldAt: null, version: s.version + 1 });

/**
 * Pure reducer. `itemIds` are the day's items in position order.
 * `insertQuickItem` needs the store to create the item first; here it is only validated (running/held).
 */
export function applyAction(state: LiveState, itemIds: number[], action: LiveAction, now: number): ApplyResult {
	if (action.type === 'start') {
		if (state.status !== 'idle') return INVALID;
		if (itemIds.length === 0) return { error: 'empty' };
		return { state: onItem(state, itemIds[0], now) };
	}
	if (state.status !== 'running' && state.status !== 'held') return INVALID;
	const idx = state.currentItemId === null ? -1 : itemIds.indexOf(state.currentItemId);
	if (idx < 0) return INVALID;

	switch (action.type) {
		case 'next':
		case 'skip':
			return { state: idx + 1 < itemIds.length ? onItem(state, itemIds[idx + 1], now) : finished(state) };
		case 'back':
			return idx === 0 ? INVALID : { state: onItem(state, itemIds[idx - 1], now) };
		case 'hold':
			if (state.status !== 'running') return INVALID;
			return { state: { ...state, status: 'held', heldAt: now, version: state.version + 1 } };
		case 'resume':
			if (state.status !== 'held' || state.heldAt === null || state.currentStartedAt === null) return INVALID;
			return { state: { ...state, status: 'running', currentStartedAt: state.currentStartedAt + (now - state.heldAt), heldAt: null, version: state.version + 1 } };
		case 'finish':
			return { state: finished(state) };
		case 'insertQuickItem':
			return { state: { ...state, version: state.version + 1 } };
	}
}
