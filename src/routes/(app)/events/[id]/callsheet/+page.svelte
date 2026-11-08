<script lang="ts">
	import { page } from '$app/state';

	let { data } = $props();
	const calls = (r: (typeof data.rows)[number]) => r.dayCalls.map((d) => `${d.dayLabel} ${d.callTime}`).join(', ');
</script>

<svelte:head><title>Call sheet · EventHub</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-2">
	<h2 class="text-lg font-semibold">Call sheet</h2>
	<div class="flex gap-2 print:hidden">
		<a href="/events/{page.params.id}/people" class="btn-secondary">People</a>
		<button type="button" class="btn-secondary" onclick={() => window.print()}>Print</button>
	</div>
</div>
{#if data.venue || data.address}
	<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{[data.venue, data.address].filter(Boolean).join(', ')}</p>
{/if}

{#if data.rows.length === 0}
	<p class="mt-4 text-sm text-slate-500">Nobody is assigned to this event yet.</p>
{:else}
	<!-- Mobile: cards -->
	<ul class="mt-4 space-y-2 sm:hidden print:hidden">
		{#each data.rows as r, i (i)}
			<li class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
				<div class="flex items-baseline justify-between gap-2">
					<span class="font-semibold">{r.name}</span>
					<span class="font-mono text-lg">{r.callTime ?? '--:--'}</span>
				</div>
				<p class="text-sm text-slate-600 dark:text-slate-400">{r.eventRole || 'No role'}</p>
				{#if r.dayCalls.length}<p class="text-sm">{calls(r)}</p>{/if}
				{#if r.phone}<p class="text-sm"><a href="tel:{r.phone}" class="text-indigo-600 dark:text-indigo-400">{r.phone}</a></p>{/if}
				{#if r.needs}<p class="text-sm text-slate-500">Needs: {r.needs}</p>{/if}
			</li>
		{/each}
	</ul>

	<!-- Desktop and print: table -->
	<table class="mt-4 hidden w-full border-collapse text-left text-sm sm:table print:table print:text-black">
		<thead>
			<tr class="border-b-2 border-slate-300 print:border-black">
				<th class="py-2 pr-3">Call</th><th class="py-2 pr-3">Name</th><th class="py-2 pr-3">Role</th>
				<th class="py-2 pr-3">Phone</th><th class="py-2 pr-3">Other days</th><th class="py-2">Needs</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as r, i (i)}
				<tr class="border-b border-slate-200 align-top dark:border-slate-800 print:border-slate-400">
					<td class="py-2 pr-3 font-mono">{r.callTime ?? '-'}</td>
					<td class="py-2 pr-3 font-medium">{r.name}</td>
					<td class="py-2 pr-3">{r.eventRole}</td>
					<td class="py-2 pr-3">{r.phone}</td>
					<td class="py-2 pr-3">{calls(r)}</td>
					<td class="py-2">{r.needs}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	@media print {
		:global(header),
		:global(nav) {
			display: none !important;
		}
		:global(body) {
			background: white !important;
			color: black !important;
		}
	}
</style>
