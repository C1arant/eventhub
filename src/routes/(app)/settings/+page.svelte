<script lang="ts">
	import { enhance } from '$app/forms';
	import Field from '#lib/components/Field.svelte';

	let { data, form } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(form?.inviteLink ?? '');
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard unavailable; the link is selectable */
		}
	}
</script>

<svelte:head><title>Settings · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">Settings</h1>

<section class="mt-6 space-y-3">
	<h2 class="text-lg font-semibold">Invite crew</h2>
	<form method="POST" action="?/invite" use:enhance={() => async ({ update }) => { copied = false; await update({ reset: false }); }} class="max-w-sm space-y-3">
		<Field label="Crew member's email" name="email" type="email" value={form?.email} error={form?.errors?.email} />
		<button class="btn-primary">Create invite link</button>
	</form>
	{#if form?.inviteLink}
		<div class="max-w-xl rounded-lg border border-slate-200 p-3 dark:border-slate-800">
			<p class="text-sm">Invite for {form.inviteEmail}. Share this link; it is shown only once and expires in 7 days.</p>
			<div class="mt-2 flex gap-2">
				<input readonly value={form.inviteLink} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()}
					class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
				<button type="button" class="btn-secondary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
			</div>
		</div>
	{/if}
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
	<p class="text-sm text-slate-600 dark:text-slate-400">Sign out of every device where you are logged in.</p>
	<form method="POST" action="/logout?/everywhere" class="mt-2">
		<button class="btn-secondary">Log out everywhere</button>
	</form>
</section>
