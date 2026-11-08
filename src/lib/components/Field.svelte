<script lang="ts">
	let {
		label,
		name,
		type = 'text',
		value = '',
		error,
		hint,
		autocomplete
	}: {
		label: string;
		name: string;
		type?: string;
		value?: string;
		error?: string;
		hint?: string;
		autocomplete?: AutoFill;
	} = $props();
</script>

<label class="block">
	<span class="mb-1 block text-sm font-medium">{label}</span>
	<input
		{name}
		{type}
		{value}
		{autocomplete}
		required
		aria-invalid={error ? 'true' : undefined}
		class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900"
	/>
	{#if error}<span class="mt-1 block text-sm text-red-600 dark:text-red-400">{error}</span>
	{:else if hint}<span class="mt-1 block text-xs text-slate-500">{hint}</span>{/if}
</label>
