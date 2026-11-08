<script lang="ts">
	import EventList from '#lib/components/EventList.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Events · EventHub</title></svelte:head>

<div class="flex items-center justify-between gap-3">
	<h1 class="text-2xl font-bold">Events</h1>
	{#if data.canCreate}<a href="/events/new" class="btn-primary">New event</a>{/if}
</div>
<div class="mt-4"><EventList events={data.events} empty="No events yet." /></div>
