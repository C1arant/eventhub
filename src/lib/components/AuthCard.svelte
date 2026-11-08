<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, subtitle = '', children }: { title: string; subtitle?: string; children: Snippet } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
	<p class="mb-6 text-sm font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">EventHub</p>
	<h1 class="text-2xl font-bold">{title}</h1>
	{#if subtitle}<p class="mt-1 mb-6 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>{/if}
	{@render children()}
</main>
