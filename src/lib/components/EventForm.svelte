<script lang="ts">
	import { EVENT_STATUSES, EVENT_TYPES, STATUS_META, TYPE_META } from '#lib/event-meta.js';

	type Vals = Partial<Record<string, string>>;
	let { values = {}, errors = {}, showStatus = false, submit = 'Save' }: {
		values?: Vals; errors?: Record<string, string>; showStatus?: boolean; submit?: string;
	} = $props();

	const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900';
	const fields = [
		{ name: 'name', label: 'Name', type: 'text', req: true },
		{ name: 'startDate', label: 'Start date', type: 'date', req: true },
		{ name: 'endDate', label: 'End date', type: 'date', req: true },
		{ name: 'venue', label: 'Venue', type: 'text', req: false },
		{ name: 'address', label: 'Address', type: 'text', req: false }
	];
</script>

<div class="space-y-3">
	{#each fields as f (f.name)}
		<label class="block">
			<span class="mb-1 block text-sm font-medium">{f.label}</span>
			<input name={f.name} type={f.type} required={f.req} value={values[f.name] ?? ''} class={input}
				aria-invalid={errors[f.name] ? 'true' : undefined} />
			{#if errors[f.name]}<span class="mt-1 block text-sm text-red-600 dark:text-red-400">{errors[f.name]}</span>{/if}
		</label>
	{/each}
	<label class="block">
		<span class="mb-1 block text-sm font-medium">Type</span>
		<select name="type" class={input} value={values.type ?? 'gig'}>
			{#each EVENT_TYPES as t (t)}<option value={t}>{TYPE_META[t].label}</option>{/each}
		</select>
		{#if errors.type}<span class="mt-1 block text-sm text-red-600 dark:text-red-400">{errors.type}</span>{/if}
	</label>
	{#if showStatus}
		<label class="block">
			<span class="mb-1 block text-sm font-medium">Status</span>
			<select name="status" class={input} value={values.status ?? 'idea'}>
				{#each EVENT_STATUSES as s (s)}<option value={s}>{STATUS_META[s].label}</option>{/each}
			</select>
		</label>
	{/if}
	<label class="block">
		<span class="mb-1 block text-sm font-medium">Notes</span>
		<textarea name="notes" rows="4" class={input}>{values.notes ?? ''}</textarea>
	</label>
	<button class="btn-primary">{submit}</button>
</div>
