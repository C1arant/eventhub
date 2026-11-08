<script lang="ts">
	import { page } from '$app/state';
	import { formatDate } from '#lib/event-meta.js';
	let { data } = $props();
	const base = $derived(`/events/${page.params.id}/live`);
</script>

<h2 class="text-lg font-semibold">Live</h2>
{#if data.days.length === 0}
	<p class="mt-3 text-slate-500">This event has no days yet.</p>
{:else}
	<ul class="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
		{#each data.days as d (d.id)}
			<li class="flex items-center gap-3 p-3">
				<div class="min-w-0 flex-1">
					<p class="font-medium">{d.label || 'Day'} · {formatDate(d.date)} · {d.startTime}</p>
					<p class="text-xs capitalize text-slate-500">{d.status === 'idle' ? 'Not started' : d.status}</p>
				</div>
				<a class="btn-primary" href="{base}/{d.id}">Open live{d.canControl ? '' : ' (view)'}</a>
			</li>
		{/each}
	</ul>
{/if}
