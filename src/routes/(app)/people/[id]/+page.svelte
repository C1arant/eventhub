<script lang="ts">
	import { enhance } from '$app/forms';
	import PersonForm from '#lib/components/PersonForm.svelte';
	import { formatDate } from '#lib/event-meta.js';

	let { data, form } = $props();
	const p = $derived(data.person);
	const values = $derived(
		form?.values ?? { name: p.name, phone: p.phone, email: p.email, tags: p.tags.join(', '), needs: p.needs, notes: p.notes }
	);
	const confirmText = $derived(
		data.eventCount > 0
			? `Delete ${p.name}? They are assigned to ${data.eventCount} event${data.eventCount === 1 ? '' : 's'} and will be removed from ${data.eventCount === 1 ? 'it' : 'them'}, and their guest links will stop working.`
			: `Delete ${p.name}?`
	);
</script>

<svelte:head><title>{p.name} · EventHub</title></svelte:head>

<p class="text-sm"><a href="/people" class="text-indigo-600 hover:underline dark:text-indigo-400">&larr; People</a></p>
<h1 class="mt-1 text-2xl font-bold">{p.name}</h1>

<section class="mt-4 max-w-lg">
	<form method="POST" action="?/update" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<PersonForm {values} errors={form?.errors} submit="Save changes" />
		{#if form?.saved}<p class="mt-2 text-sm text-emerald-600" role="status">Saved.</p>{/if}
	</form>
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold">Event history</h2>
	{#if p.history.length === 0}
		<p class="mt-2 text-sm text-slate-500">Not assigned to any events yet.</p>
	{:else}
		<ul class="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
			{#each p.history as h (h.eventId)}
				<li>
					<a href="/events/{h.eventId}/people" class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
						<span class="min-w-0 truncate font-medium">{h.eventName}</span>
						<span class="shrink-0 text-sm text-slate-500">{h.eventRole || 'No role'} · {formatDate(h.startDate)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-8">
	<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}>
		<button class="btn-secondary text-red-700 dark:text-red-400">Delete person</button>
	</form>
</section>
