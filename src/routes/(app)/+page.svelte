<script lang="ts">
	import EventList from '#lib/components/EventList.svelte';
	import TaskCheck from '#lib/components/TaskCheck.svelte';
	import { formatDate } from '#lib/event-meta.js';
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
	{#if data.myTasks.length === 0}<p class="text-sm text-slate-500">No tasks due this week.</p>
	{:else}
		<ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
			{#each data.myTasks as t (t.id)}
				<li class="flex items-center gap-1 pr-3">
					<TaskCheck eventId={t.eventId} taskId={t.id} status={t.status} title={t.title} />
					<a href="/events/{t.eventId}/tasks" class="min-w-0 flex-1 py-2">
						<span class="block truncate font-medium">{t.title}</span>
						<span class="block truncate text-sm text-slate-500">{t.eventName}</span>
					</a>
					{#if t.dueDate}<span class="whitespace-nowrap text-sm {t.dueDate < data.date ? 'font-semibold text-red-600' : 'text-slate-500'}">{t.dueDate < data.date ? 'Overdue · ' : ''}{formatDate(t.dueDate)}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<a href="/tasks" class="text-sm text-indigo-600">All my tasks</a>
</section>
