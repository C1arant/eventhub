<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Settings · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">Settings</h1>

<section class="mt-6 space-y-1">
	<h2 class="text-lg font-semibold">Invite crew</h2>
	<p class="text-sm text-slate-600 dark:text-slate-400">Invite crew from an event's People tab: assign them, then use "Send crew invite".</p>
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold">Users</h2>
	<ul class="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
		{#each data.users as u (u.id)}
			<li class="flex items-center justify-between gap-3 px-3 py-2">
				<div class="min-w-0">
					<p class="truncate font-medium">{u.name}</p>
					<p class="truncate text-sm text-slate-500">{u.email}</p>
				</div>
				<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{u.role}</span>
			</li>
		{/each}
	</ul>
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold">Sessions</h2>
	<p class="text-sm text-slate-600 dark:text-slate-400">To sign out everywhere, use <a class="underline" href="/account">Account</a>.</p>
</section>
