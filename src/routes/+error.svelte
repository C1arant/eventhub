<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · EventHub</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 text-center">
	<p class="text-5xl font-bold text-indigo-600">{page.status}</p>
	<h1 class="mt-3 text-xl font-semibold">{page.error?.message}</h1>
	{#if page.error?.requestId}
		<p class="mt-2 text-xs text-slate-500">Reference: {page.error.requestId}</p>
	{/if}
	<a href="/" class="btn-primary mt-6 inline-block">Go home</a>
</main>
