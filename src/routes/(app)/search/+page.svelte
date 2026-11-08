<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const groups = $derived(
		(['event', 'task', 'person'] as const)
			.map((kind) => ({
				kind,
				label: { event: 'Events', task: 'Tasks', person: 'People' }[kind],
				items: data.results.filter((r) => r.kind === kind)
			}))
			.filter((g) => g.items.length > 0)
	);

	// Split on the private marker chars; odd segments are matches. Rendered as text, never HTML.
	function segments(s: string): { text: string; mark: boolean }[] {
		return s
			.split('\u0002')
			.flatMap((part, i) => {
				if (i === 0) return [{ text: part, mark: false }];
				const [m, ...rest] = part.split('\u0003');
				return [{ text: m, mark: true }, { text: rest.join('\u0003'), mark: false }];
			})
			.filter((x) => x.text !== '');
	}
</script>

<svelte:head><title>Search</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">Search</h1>

{#if !data.q}
	<p class="text-slate-600 dark:text-slate-400">Type something in the search box to find events, people and tasks.</p>
{:else if data.results.length === 0}
	<p class="text-slate-600 dark:text-slate-400">No results for “{data.q}”.</p>
{:else}
	{#each groups as g (g.kind)}
		<section class="mb-6">
			<h2 class="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">{g.label}</h2>
			<ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
				{#each g.items as r (r.kind + r.refId)}
					<li class="px-3 py-2">
						{#if r.href}
							<a href={r.href} class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{r.title}</a>
						{:else}
							<span class="font-medium">{r.title}</span>
						{/if}
						<p class="text-sm text-slate-600 dark:text-slate-400">
							{#each segments(r.snippet) as s, i (i)}{#if s.mark}<mark class="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700 dark:text-white">{s.text}</mark>{:else}{s.text}{/if}{/each}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}
