<script lang="ts">
	import TaskCheck from '#lib/components/TaskCheck.svelte';
	import { formatDate } from '#lib/event-meta.js';

	let { data } = $props();
</script>

<svelte:head><title>My tasks · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">My tasks</h1>

{#if data.tasks.length === 0}
	<p class="mt-4 text-sm text-slate-500">Nothing on your list. 🎉</p>
{:else}
	<ul class="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
		{#each data.tasks as t (t.id)}
			<li class="flex items-center gap-1 pr-3">
				<TaskCheck eventId={t.eventId} taskId={t.id} status={t.status} title={t.title} />
				<a href="/events/{t.eventId}/tasks" class="min-w-0 flex-1 py-2">
					<span class="block truncate font-medium">{t.title}</span>
					<span class="block truncate text-sm text-slate-500">{t.eventName}</span>
				</a>
				{#if t.priority === 'high'}<span class="text-xs font-semibold text-red-600">High</span>{/if}
				{#if t.dueDate}
					<span class="whitespace-nowrap text-sm {t.dueDate < data.today ? 'font-semibold text-red-600' : 'text-slate-500'}">{t.dueDate < data.today ? 'Overdue · ' : ''}{formatDate(t.dueDate)}</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
