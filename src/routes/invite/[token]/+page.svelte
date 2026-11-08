<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Field from '#lib/components/Field.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Join EventHub</title></svelte:head>

<AuthCard title="Join the crew" subtitle={'You have been invited as ' + data.email + '.'}>
	<form method="POST" use:enhance class="space-y-4">
		{#if form?.errors?._form}
			<p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{form.errors._form}</p>
		{/if}
		<Field label="Your name" name="name" autocomplete="name" value={form?.name} error={form?.errors?.name} />
		<Field label="Choose a password" name="password" type="password" autocomplete="new-password" error={form?.errors?.password} hint="At least 10 characters" />
		<button class="btn-primary w-full">Create account</button>
	</form>
</AuthCard>
