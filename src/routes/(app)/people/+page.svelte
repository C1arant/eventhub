<script lang="ts">
	import PersonForm from '#lib/components/PersonForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>People · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">People</h1>

<form method="GET" class="mt-4 flex flex-wrap gap-2" role="search">
	<input type="search" name="q" value={data.q} placeholder="Search name, email, phone" aria-label="Search people"
		class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
	<select name="tag" aria-label="Filter by tag" class="rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
		<option value="">All tags</option>
		{#each data.tags as t (t)}<option value={t} selected={t === data.tag}>{t}</option>{/each}
	</select>
	<button class="btn-secondary">Filter</button>
</form>

{#if data.people.length === 0}
	<p class="mt-4 text-sm text-slate-500">{data.q || data.tag ? 'Nobody matches.' : 'No people yet. Add the first one below.'}</p>
{:else}
	<ul class="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
		{#each data.people as p (p.id)}
			<li>
				<a href="/people/{p.id}" class="flex items-center justify-between gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
					<div class="min-w-0">
						<p class="truncate font-medium">{p.name}</p>
						<p class="truncate text-sm text-slate-500">{[p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
					</div>
					<div class="flex flex-wrap justify-end gap-1">
						{#each p.tags as t (t)}<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{t}</span>{/each}
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<section class="mt-8 max-w-lg">
	<h2 class="text-lg font-semibold">Add a person</h2>
	<form method="POST" action="?/create" class="mt-3">
		<PersonForm values={form?.values} errors={form?.errors} submit="Add person" />
	</form>
</section>
