<script lang="ts">
	import { enhance } from '$app/forms';
	import EventForm from '#lib/components/EventForm.svelte';

	let { data, form } = $props();
	const ev = $derived(data.event);
	const input = 'rounded-lg border border-slate-300 bg-white px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
	const err = (name: string): Record<string, string> | undefined => (form?.form === name ? form.errors : undefined);
</script>

<section>
	<h2 class="text-lg font-semibold">Details</h2>
	{#if data.canEdit}
		<form method="POST" action="?/update" use:enhance={() => async ({ update }) => update({ reset: false })} class="mt-3 max-w-lg">
			<EventForm values={form?.form === 'event' && form.values ? form.values : { name: ev.name, type: ev.type, startDate: ev.startDate, endDate: ev.endDate, venue: ev.venue, address: ev.address, status: ev.status, notes: ev.notes }} errors={err('event')} showStatus submit="Save changes" />
			{#if form?.form === 'event' && form.saved}<p class="mt-2 text-sm text-emerald-600" role="status">Saved.</p>{/if}
		</form>
	{:else}
		<dl class="mt-3 grid max-w-lg grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-slate-500">Dates</dt><dd>{ev.startDate} to {ev.endDate}</dd>
			<dt class="text-slate-500">Venue</dt><dd>{ev.venue || '-'}</dd>
			<dt class="text-slate-500">Address</dt><dd>{ev.address || '-'}</dd>
			<dt class="text-slate-500">Notes</dt><dd class="whitespace-pre-wrap">{ev.notes || '-'}</dd>
		</dl>
	{/if}
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold">Days</h2>
	<ul class="mt-3 space-y-3">
		{#each data.days as d (d.id)}
			<li class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
				{#if data.canEdit}
					<form method="POST" action="?/updateDay" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex flex-wrap items-end gap-2">
						<input type="hidden" name="dayId" value={d.id} />
						<label class="min-w-32 flex-1"><span class="block text-xs text-slate-500">Label</span><input name="label" required value={d.label} class="w-full {input}" /></label>
						<label><span class="block text-xs text-slate-500">Date</span><input name="date" type="date" required value={d.date} class={input} /></label>
						<label><span class="block text-xs text-slate-500">Start</span><input name="startTime" type="time" required value={d.startTime} class={input} /></label>
						<button class="btn-secondary">Save</button>
						<button class="btn-secondary text-red-600" formaction="?/deleteDay" onclick={(e) => { if (!confirm('Delete this day?')) e.preventDefault(); }}>Delete</button>
					</form>
					{#each Object.values(err(`day${d.id}`) ?? {}) as m (m)}<p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
				{:else}
					<p class="font-medium">{d.label}</p>
					<p class="text-sm text-slate-500">{d.date} · {d.startTime}</p>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.canEdit}
		<form method="POST" action="?/addDay" use:enhance class="mt-4 flex flex-wrap items-end gap-2">
			<label class="min-w-32 flex-1"><span class="block text-xs text-slate-500">Label</span><input name="label" required placeholder="Day 2" class="w-full {input}" /></label>
			<label><span class="block text-xs text-slate-500">Date</span><input name="date" type="date" required value={ev.startDate} class={input} /></label>
			<label><span class="block text-xs text-slate-500">Start</span><input name="startTime" type="time" required value="19:00" class={input} /></label>
			<button class="btn-primary">Add day</button>
		</form>
		{#each Object.values(err('addDay') ?? {}) as m (m)}<p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
	{/if}
</section>

{#if data.canTemplate}
	<section class="mt-8">
		<h2 class="text-lg font-semibold">Save as template</h2>
		<p class="text-sm text-slate-500">Tasks, sections, days and run-of-show are saved. Assigned people and files aren't copied.</p>
		<form method="POST" action="?/saveTemplate" use:enhance class="mt-2 flex flex-wrap items-end gap-2">
			<label class="min-w-48 flex-1"><span class="block text-xs text-slate-500">Template name</span><input name="templateName" required value={ev.name} class="w-full {input}" /></label>
			<button class="btn-secondary">Save as template</button>
		</form>
		{#each Object.values(err('template') ?? {}) as m (m)}<p class="mt-1 text-sm text-red-600" role="alert">{m}</p>{/each}
		{#if form?.form === 'template' && form.saved}<p class="mt-1 text-sm text-emerald-600" role="status">Saved. <a href="/templates" class="underline">View templates</a></p>{/if}
	</section>
{/if}

{#if data.canEdit}
	<section class="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
		<h2 class="text-lg font-semibold text-red-600">Danger zone</h2>
		<form method="POST" action="?/delete" class="mt-2" onsubmit={(e) => { if (!confirm('Delete this event and everything in it? This cannot be undone.')) e.preventDefault(); }}>
			<button class="btn-secondary text-red-600">Delete event</button>
		</form>
	</section>
{/if}
