<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = $derived([
		{ href: '/', label: 'Dashboard' },
		{ href: '/events', label: 'Events' },
		...(data.user.role === 'owner' ? [{ href: '/people', label: 'People' }] : []),
		{ href: '/tasks', label: 'My tasks' },
		...(data.user.role === 'owner' ? [{ href: '/templates', label: 'Templates' }] : []),
		...(data.user.role === 'owner' ? [{ href: '/settings', label: 'Settings' }] : [])
	]);
	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="min-h-dvh pb-16 sm:pb-0">
	<header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
		<div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
			<a href="/" class="font-semibold text-indigo-600 dark:text-indigo-400">EventHub</a>
			<nav class="ml-4 hidden gap-1 sm:flex" aria-label="Main">
				{#each links as l (l.href)}
					<a href={l.href} aria-current={active(l.href) ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm hover:bg-slate-100 aria-[current=page]:bg-indigo-50 aria-[current=page]:font-medium aria-[current=page]:text-indigo-700 dark:hover:bg-slate-800 dark:aria-[current=page]:bg-indigo-950 dark:aria-[current=page]:text-indigo-300">{l.label}</a>
				{/each}
			</nav>
			<form action="/search" method="GET" class="ml-auto min-w-0 flex-1 sm:max-w-xs" role="search">
				<input type="search" name="q" placeholder="Search" aria-label="Search"
					class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
			</form>
			<a href="/account" aria-current={page.url.pathname.startsWith('/account') ? 'page' : undefined} class="shrink-0 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 aria-[current=page]:font-medium dark:hover:bg-slate-800">Account</a>
			<form method="POST" action="/logout?/logout">
				<button class="btn-secondary" title={data.user.email}>Log out</button>
			</form>
		</div>
	</header>

	<div class="mx-auto max-w-5xl px-4 py-6">
		{@render children()}
	</div>

	<nav class="fixed inset-x-0 bottom-0 z-10 grid border-t border-slate-200 bg-white sm:hidden dark:border-slate-800 dark:bg-slate-900"
		style="grid-template-columns: repeat({links.length}, minmax(0, 1fr)); padding-bottom: env(safe-area-inset-bottom)" aria-label="Main">
		{#each links as l (l.href)}
			<a href={l.href} aria-current={active(l.href) ? 'page' : undefined}
				class="py-3 text-center text-xs text-slate-600 aria-[current=page]:font-semibold aria-[current=page]:text-indigo-600 dark:text-slate-400 dark:aria-[current=page]:text-indigo-400">{l.label}</a>
		{/each}
	</nav>
</div>
