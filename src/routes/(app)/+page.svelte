<script lang="ts">
	import EventList from '#lib/components/EventList.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Dashboard · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">Dashboard</h1>

<section class="mt-6 space-y-2">
	<h2 class="text-lg font-semibold">Today</h2>
	<EventList events={data.today} empty="Nothing on today." />
</section>

<section class="mt-8 space-y-2">
	<h2 class="text-lg font-semibold">Upcoming</h2>
	<EventList events={data.upcoming} empty="No upcoming events." />
</section>

<section class="mt-8 space-y-2">
	<h2 class="text-lg font-semibold">My tasks</h2>
	{#if data.myTasks.length === 0}<p class="text-sm text-slate-500">No tasks due this week.</p>{/if}
</section>
