<script lang="ts">
	import { TYPE_META, formatDate } from '#lib/event-meta.js';
	import StatusPill from './StatusPill.svelte';
	import type { EventSummary } from '#lib/server/events.js';

	let { events, empty = 'No events.' }: { events: EventSummary[]; empty?: string } = $props();
</script>

{#if events.length === 0}
	<p class="text-sm text-slate-500">{empty}</p>
{:else}
	<ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
		{#each events as e (e.id)}
			<li>
				<a href="/events/{e.id}" class="flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
					<span class="text-xl" title={TYPE_META[e.type]?.label ?? e.type} aria-hidden="true">{TYPE_META[e.type]?.icon ?? '📌'}</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{e.name}</span>
						<span class="block truncate text-sm text-slate-500">
							{formatDate(e.startDate)}{e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}{e.venue ? ` · ${e.venue}` : ''}
						</span>
					</span>
					<StatusPill status={e.status} />
				</a>
			</li>
		{/each}
	</ul>
{/if}
