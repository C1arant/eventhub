<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Field from '#lib/components/Field.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Log in · EventHub</title></svelte:head>

<AuthCard title="Log in" subtitle="Welcome back to EventHub.">
	<form method="POST" use:enhance class="space-y-4">
		{#if form?.message}
			<p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{form.message}</p>
		{/if}
		<Field label="Email" name="email" type="email" autocomplete="username" value={form?.email} error={form?.errors?.email} />
		<Field label="Password" name="password" type="password" autocomplete="current-password" error={form?.errors?.password} />
		<button class="btn-primary w-full">Log in</button>
	</form>
</AuthCard>
