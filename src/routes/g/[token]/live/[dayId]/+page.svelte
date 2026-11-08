<script lang="ts">
	import { untrack } from 'svelte';
	import LiveBoard, { type Snap } from '#lib/components/LiveBoard.svelte';
	import { createLiveClient } from '#lib/live-client.js';

	let { data } = $props();
	let snap = $state<Snap>(untrack(() => data.snapshot) as Snap);
	let status = $state<'connected' | 'reconnecting' | 'denied'>('connected');

	$effect(() => {
		const c = createLiveClient<Snap>(
			`/live/${data.dayId}/stream?t=${encodeURIComponent(data.token)}`,
			(s) => {
				if (s.state.version >= snap.state.version) snap = s;
			},
			(s) => (status = s),
			`/live/${data.dayId}/check?t=${encodeURIComponent(data.token)}`
		);
		return () => c.close();
	});
</script>

<svelte:head>
	<title>Live</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto max-w-lg space-y-4 p-4">
	<a class="text-blue-700 underline" href={`/g/${encodeURIComponent(data.token)}`}>Back</a>
	{#if status === 'denied'}
		<p class="mt-10 text-center text-2xl font-bold">This link is no longer valid</p>
	{:else}
		{#if status === 'reconnecting'}<p class="rounded bg-amber-100 px-3 py-1 text-amber-800">Reconnecting…</p>{/if}
		<LiveBoard {snap} />
	{/if}
</main>
