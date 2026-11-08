export const EVENT_TYPES = ['gig', 'club', 'theatre', 'corporate', 'esports', 'charity_stream', 'other'] as const;
export const EVENT_STATUSES = ['idea', 'confirmed', 'show_day', 'done'] as const;

export const TYPE_META: Record<string, { label: string; icon: string }> = {
	gig: { label: 'Gig', icon: '🎸' },
	club: { label: 'Club night', icon: '🪩' },
	theatre: { label: 'Theatre', icon: '🎭' },
	corporate: { label: 'Corporate', icon: '💼' },
	esports: { label: 'Esports', icon: '🎮' },
	charity_stream: { label: 'Charity stream', icon: '📺' },
	other: { label: 'Other', icon: '📌' }
};

export const STATUS_META: Record<string, { label: string; cls: string }> = {
	idea: { label: 'Idea', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
	confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
	show_day: { label: 'Show day', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
	done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
};

export function formatDate(d: string): string {
	const [y, m, day] = d.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
