<script lang="ts">
	import { SUGGESTED_TAGS } from '#lib/people-meta.js';

	let {
		values = {},
		errors = {},
		submit
	}: { values?: Record<string, string>; errors?: Record<string, string>; submit: string } = $props();
	const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900';
	// svelte-ignore state_referenced_locally
	let tags = $state(values.tags ?? '');
	function addTag(t: string) {
		const have = tags.split(',').map((x) => x.trim().toLowerCase());
		if (!have.includes(t)) tags = tags.trim() === '' ? t : `${tags.replace(/,\s*$/, '')}, ${t}`;
	}
</script>

<div class="space-y-3">
	<label class="block"><span class="mb-1 block text-sm font-medium">Name</span>
		<input name="name" required value={values.name ?? ''} class={inp} aria-invalid={errors.name ? 'true' : undefined} />
		{#if errors.name}<span class="mt-1 block text-sm text-red-600 dark:text-red-400">{errors.name}</span>{/if}</label>
	<div class="grid gap-3 sm:grid-cols-2">
		<label class="block"><span class="mb-1 block text-sm font-medium">Phone (optional)</span>
			<input name="phone" type="tel" value={values.phone ?? ''} class={inp} /></label>
		<label class="block"><span class="mb-1 block text-sm font-medium">Email (optional)</span>
			<input name="email" type="email" value={values.email ?? ''} class={inp} aria-invalid={errors.email ? 'true' : undefined} />
			{#if errors.email}<span class="mt-1 block text-sm text-red-600 dark:text-red-400">{errors.email}</span>{/if}</label>
	</div>
	<div>
		<label class="block"><span class="mb-1 block text-sm font-medium">Tags</span>
			<input name="tags" bind:value={tags} placeholder="sound, stage" class={inp} />
			<span class="mt-1 block text-xs text-slate-500">Comma separated.</span></label>
		<div class="mt-1 flex flex-wrap gap-1">
			{#each SUGGESTED_TAGS as t (t)}
				<button type="button" onclick={() => addTag(t)} class="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">+ {t}</button>
			{/each}
		</div>
	</div>
	<label class="block"><span class="mb-1 block text-sm font-medium">Needs (diet, access, travel)</span>
		<input name="needs" value={values.needs ?? ''} class={inp} /></label>
	<label class="block"><span class="mb-1 block text-sm font-medium">Notes</span>
		<textarea name="notes" rows="3" class={inp}>{values.notes ?? ''}</textarea></label>
	<button class="btn-primary">{submit}</button>
</div>
