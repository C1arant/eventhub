<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import LiveBoard, { type Snap } from '#lib/components/LiveBoard.svelte';
	import { createLiveClient } from '#lib/live-client.js';

	let { data } = $props();
	let snap = $state<Snap>(untrack(() => data.snapshot) as Snap);
	let status = $state<'connected' | 'reconnecting' | 'denied'>('connected');
	const obs = $derived(page.url.searchParams.get('obs') === '1');

	$effect(() => {
		const c = createLiveClient<Snap>(
			`/live/${data.dayId}/stream`,
			(s) => {
				if (s.state.version >= snap.state.version) snap = s;
			},
			(s) => (status = s),
			`/live/${data.dayId}/check`
		);
		return () => c.close();
	});
</script>

<svelte:head><title>Stage display</title></svelte:head>

<div class="fixed inset-0 overflow-auto p-6 text-white {obs ? 'bg-transparent' : 'bg-black'}">
	{#if status === 'denied'}
		<p class="mt-24 text-center text-5xl font-bold">This link is no longer valid</p>
	{:else if status === 'reconnecting'}
		<p class="fixed right-4 top-4 rounded bg-amber-500/30 px-3 py-1 text-amber-300">Reconnecting…</p>
	{/if}
	{#if status !== 'denied'}<LiveBoard {snap} big />{/if}
</div>

<style>
	:global(body) {
		background: transparent;
	}
</style>
