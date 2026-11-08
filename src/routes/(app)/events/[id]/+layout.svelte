<script lang="ts">
	import { page } from '$app/state';
	import { TYPE_META } from '#lib/event-meta.js';
	import StatusPill from '#lib/components/StatusPill.svelte';

	let { data, children } = $props();
	const base = $derived(`/events/${data.event.id}`);
	const tabs = $derived([
		{ href: base, label: 'Overview' },
		{ href: `${base}/tasks`, label: 'Tasks' },
		{ href: `${base}/people`, label: 'People' },
		{ href: `${base}/callsheet`, label: 'Call sheet' },
		{ href: `${base}/run-of-show`, label: 'Run-of-show' },
		{ href: `${base}/live`, label: 'Live' },
		{ href: `${base}/files`, label: 'Files' }
	]);
	const active = (href: string) => (href === base ? page.url.pathname === base : page.url.pathname.startsWith(href));
</script>

<svelte:head><title>{data.event.name} · EventHub</title></svelte:head>

<div class="flex items-center gap-2">
	<span class="text-2xl" aria-hidden="true">{TYPE_META[data.event.type]?.icon ?? '📌'}</span>
	<h1 class="min-w-0 truncate text-2xl font-bold">{data.event.name}</h1>
	<StatusPill status={data.event.status} />
</div>
<nav class="-mx-4 mt-3 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 dark:border-slate-800" aria-label="Event sections">
	{#each tabs as t (t.href)}
		<a href={t.href} aria-current={active(t.href) ? 'page' : undefined}
			class="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm hover:text-indigo-600 aria-[current=page]:border-indigo-600 aria-[current=page]:font-semibold aria-[current=page]:text-indigo-700 dark:aria-[current=page]:text-indigo-300">{t.label}</a>
	{/each}
</nav>
<div class="mt-5">{@render children()}</div>
