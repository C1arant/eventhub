<script lang="ts">
	import { enhance } from '$app/forms';
	import { TYPE_META } from '#lib/event-meta.js';
	let { data, form } = $props();
</script>

<svelte:head><title>Templates · EventHub</title></svelte:head>

<div class="flex items-center justify-between gap-3">
	<h1 class="text-2xl font-bold">Templates</h1>
	<a href="/events/new" class="btn-primary">New event</a>
</div>
<p class="mt-1 text-sm text-slate-500">Tasks, sections, days and run-of-show are saved. Assigned people and files aren't copied.</p>
{#if form?.error}<p class="mt-2 text-sm text-red-600" role="alert">{form.error}</p>{/if}

{#if data.templates.length === 0}
	<p class="mt-6 text-slate-500">No templates yet. Open an event and choose "Save as template".</p>
{:else}
	<ul class="mt-4 space-y-2">
		{#each data.templates as t (t.id)}
			<li class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
				<div class="min-w-0">
					<p class="truncate font-medium">{t.name}</p>
					<p class="text-sm text-slate-500">
						{TYPE_META[t.type as keyof typeof TYPE_META]?.label ?? t.type}
						{#if t.broken}<span class="text-red-600"> · damaged, cannot be used</span>{:else} · {t.dayCount} {t.dayCount === 1 ? 'day' : 'days'} · {t.taskCount} tasks{/if}
					</p>
				</div>
				<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm(`Delete template "${t.name}"?`)) cancel(); }}>
					<input type="hidden" name="id" value={t.id} />
					<button class="btn-secondary text-red-600">Delete</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
