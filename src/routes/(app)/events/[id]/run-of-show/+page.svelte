<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { dndzone } from 'svelte-dnd-action';
	import { formatDate } from '#lib/event-meta.js';

	let { data, form } = $props();
	const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
	const err = (name: string): Record<string, string> | undefined => (form?.form === name ? form.errors : undefined);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const label = (t: string) => t.replaceAll('_', ' ');
	const mins = (sec: number) => Math.round(sec / 60);
	const base = $derived(`/events/${page.params.id}/run-of-show`);

	let list = $state<typeof data.items>([]);
	let dragDisabled = $state(true);
	let reorderError = $state('');
	$effect(() => {
		list = data.items.map((i) => ({ ...i }));
	});

	function consider(e: CustomEvent<{ items: typeof list }>) {
		list = e.detail.items;
	}
	async function finalize(e: CustomEvent<{ items: typeof list }>) {
		list = e.detail.items;
		dragDisabled = true;
		if (!data.day) return;
		const fd = new FormData();
		fd.set('dayId', String(data.day.id));
		fd.set('order', JSON.stringify(list.map((i) => i.id)));
		try {
			const res = await fetch('?/reorder', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			reorderError = result.type === 'success' ? '' : "Couldn't save the new order — the list was refreshed";
		} catch {
			reorderError = "Couldn't save the new order — the list was refreshed";
		}
		await invalidateAll();
	}
</script>

{#snippet fields(v: Record<string, string>, id: string)}
	<label class="block"><span class="text-xs text-slate-500">Title</span><input name="title" required value={v.title ?? ''} class={inp} /></label>
	<div class="grid grid-cols-3 gap-2">
		<label class="block"><span class="text-xs text-slate-500">Type</span>
			<select name="type" class={inp}>
				{#each data.types as t (t)}<option value={t} selected={t === (v.type ?? 'act')}>{label(t)}</option>{/each}
			</select></label>
		<label class="block"><span class="text-xs text-slate-500">Minutes</span>
			<input name="durationMin" type="number" min="1" max="1440" step="1" required value={v.durationMin ?? '10'} class={inp} /></label>
		<label class="block"><span class="text-xs text-slate-500">Hard start</span>
			<input name="hardStart" type="time" value={v.hardStart ?? ''} class={inp} /></label>
	</div>
	<label class="block"><span class="text-xs text-slate-500">People (comma-separated)</span><input name="people" value={v.people ?? ''} class={inp} /></label>
	<div class="grid gap-2 sm:grid-cols-2">
		<label class="block"><span class="text-xs text-slate-500">Sound notes</span><textarea name="notesSound" rows="2" class={inp}>{v.notesSound ?? ''}</textarea></label>
		<label class="block"><span class="text-xs text-slate-500">Lighting notes</span><textarea name="notesLighting" rows="2" class={inp}>{v.notesLighting ?? ''}</textarea></label>
		<label class="block"><span class="text-xs text-slate-500">Video notes</span><textarea name="notesVideo" rows="2" class={inp}>{v.notesVideo ?? ''}</textarea></label>
		<label class="block"><span class="text-xs text-slate-500">Stage notes</span><textarea name="notesStage" rows="2" class={inp}>{v.notesStage ?? ''}</textarea></label>
	</div>
	{#each Object.values(err(id) ?? {}) as m (m)}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
{/snippet}

<h2 class="sr-only">Run-of-show</h2>

{#if !data.day}
	<p class="text-sm text-slate-500">This event has no days yet.</p>
{:else}
	<div class="flex flex-wrap items-center gap-2">
		<nav class="flex flex-wrap gap-1" aria-label="Days">
			{#each data.days as d (d.id)}
				<a href="{base}?day={d.id}" aria-current={d.id === data.day.id ? 'page' : undefined}
					class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm aria-[current=page]:border-indigo-600 aria-[current=page]:bg-indigo-600 aria-[current=page]:text-white dark:border-slate-700">
					{d.label || formatDate(d.date)}
				</a>
			{/each}
		</nav>
		<span class="text-sm text-slate-500">Starts {data.day.startTime}</span>
		<span class="flex-1"></span>
		<a class="btn-secondary" href="{base}/{data.day.id}/print" target="_blank" rel="noopener">Print</a>
		{#each ['sound', 'lighting', 'video', 'stage'] as dept (dept)}
			<a class="btn-secondary capitalize" href="{base}/{data.day.id}/print?dept={dept}" target="_blank" rel="noopener">{dept}</a>
		{/each}
	</div>

	{#if data.items.length === 0}<p class="mt-4 text-sm text-slate-500">No items yet.{data.canEdit ? ' Add the first one below.' : ''}</p>{/if}
	{#if reorderError}<p class="mt-2 text-sm text-red-600" role="alert">{reorderError}</p>{/if}

	<ol class="mt-4 space-y-2" use:dndzone={{ items: list, dragDisabled: !data.canEdit || dragDisabled, flipDurationMs: 150, dropTargetStyle: {} }}
		onconsider={consider} onfinalize={finalize} aria-label="Items">
		{#each list as t, i (t.id)}
			<li class="rounded-lg border bg-white dark:bg-slate-900 {t.conflict ? 'border-amber-500' : 'border-slate-200 dark:border-slate-800'}">
				<div class="flex items-start gap-1 pr-2">
					{#if data.canEdit}
						<span class="flex min-h-11 w-8 cursor-grab touch-none select-none items-center justify-center text-slate-400" aria-hidden="true"
							onpointerdown={() => (dragDisabled = false)} onpointerup={() => (dragDisabled = true)}>⠿</span>
					{/if}
					<details class="min-w-0 flex-1">
						<summary class="flex min-h-11 cursor-pointer list-none items-center gap-3 py-1">
							<span class="w-20 shrink-0 font-mono text-base tabular-nums">
								{t.clock}{#if t.dayOffset >= 1}<span class="ml-1 rounded bg-slate-200 px-1 text-xs dark:bg-slate-700">+{t.dayOffset}</span>{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{t.title}</span>
								<span class="block truncate text-sm text-slate-500">{label(t.type)} · {mins(t.durationSec)} min{t.people ? ` · ${t.people}` : ''}</span>
							</span>
							{#if t.conflict}<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-100" role="status">Overlap: hard start is before the previous item ends</span>{/if}
							{#if t.hardStart}<span class="whitespace-nowrap text-xs text-slate-500">fixed</span>{/if}
						</summary>
						{#if data.canEdit}
							<form method="POST" action="?/update" use:enhance={keep} class="space-y-2 pb-3">
								<input type="hidden" name="itemId" value={t.id} />
								{@render fields({ title: t.title, type: t.type, durationMin: String(mins(t.durationSec)), hardStart: t.hardStart ?? '', people: t.people, notesSound: t.notesSound, notesLighting: t.notesLighting, notesVideo: t.notesVideo, notesStage: t.notesStage }, `item${t.id}`)}
								<div class="flex gap-2">
									<button class="btn-primary">Save item</button>
									<button class="btn-secondary text-red-600" formaction="?/delete" onclick={(e) => { if (!confirm('Delete this item?')) e.preventDefault(); }}>Delete</button>
								</div>
							</form>
						{:else}
							<dl class="space-y-1 pb-3 text-sm">
								{#each [['Sound', t.notesSound], ['Lighting', t.notesLighting], ['Video', t.notesVideo], ['Stage', t.notesStage]] as [k, v] (k)}
									{#if v}<div><dt class="inline font-semibold">{k}:</dt> <dd class="inline whitespace-pre-wrap">{v}</dd></div>{/if}
								{/each}
							</dl>
						{/if}
					</details>
					{#if data.canEdit}
						<form method="POST" action="?/move" use:enhance class="flex items-center gap-1 py-1">
							<input type="hidden" name="itemId" value={t.id} />
							<button name="dir" value="up" class="btn-secondary min-h-11" disabled={i === 0} aria-label="Move {t.title} up">↑</button>
							<button name="dir" value="down" class="btn-secondary min-h-11" disabled={i === list.length - 1} aria-label="Move {t.title} down">↓</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	{#if data.canEdit}
		<details class="mt-6" open={form?.form === 'add' && !form.saved}>
			<summary class="btn-secondary inline-block cursor-pointer list-none">Add item</summary>
			<form method="POST" action="?/add" use:enhance class="mt-2 max-w-2xl space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
				<input type="hidden" name="dayId" value={data.day.id} />
				{@render fields(form?.form === 'add' && form.values ? form.values : {}, 'add')}
				<button class="btn-primary">Add item</button>
			</form>
		</details>
	{/if}
{/if}
