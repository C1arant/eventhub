<script lang="ts">
	import { page } from '$app/state';
	import { fmtClock } from '#lib/live-format.js';
	let { data } = $props();
	const diff = (s: number) => (s === 0 ? '0:00' : `${s > 0 ? '+' : '−'}${fmtClock(Math.abs(s)).replace(/^0/, '')}`);
	const tone = (s: number | null) => (s !== null && s > 0 ? 'text-red-600' : s !== null && s < 0 ? 'text-emerald-600' : '');
</script>

<svelte:head><title>Report · {data.day.label || 'Day'} · EventHub</title></svelte:head>
<div class="flex items-center gap-2">
	<h2 class="flex-1 text-lg font-semibold">Show report · {data.day.label || 'Day'} · {data.day.date}</h2>
	<a class="text-sm text-indigo-600 underline" href="/events/{page.params.id}/live/{data.day.id}">Back to live</a>
</div>
<div class="mt-3 overflow-x-auto">
	<table class="w-full text-left text-sm">
		<thead class="border-b border-slate-300 dark:border-slate-700">
			<tr><th class="p-2">Item</th><th class="p-2">Planned start</th><th class="p-2">Actual start</th><th class="p-2">Planned</th><th class="p-2">Actual</th><th class="p-2">Difference</th></tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.itemId)}
				<tr class="border-b border-slate-200 dark:border-slate-800">
					<td class="p-2 font-medium">{r.title}</td>
					<td class="p-2">{r.plannedStart}</td>
					<td class="p-2">{r.actualStart ?? '—'}</td>
					<td class="p-2 tabular-nums">{fmtClock(r.plannedDurSec)}</td>
					<td class="p-2 tabular-nums">{r.actualDurSec === null ? '—' : fmtClock(r.actualDurSec)}</td>
					<td class="p-2 tabular-nums {tone(r.diffSec)}">{r.diffSec === null ? '—' : diff(r.diffSec)}</td>
				</tr>
			{:else}
				<tr><td class="p-2 text-slate-500" colspan="6">No items.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
