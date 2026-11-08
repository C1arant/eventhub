<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Field from '#lib/components/Field.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Set up EventHub</title></svelte:head>

<AuthCard title="Set up EventHub" subtitle="Create the owner account to get started.">
	<form method="POST" use:enhance class="space-y-4">
		<Field label="Your name" name="name" autocomplete="name" value={form?.name} error={form?.errors?.name} />
		<Field label="Email" name="email" type="email" autocomplete="email" value={form?.email} error={form?.errors?.email} />
		<Field label="Password" name="password" type="password" autocomplete="new-password" error={form?.errors?.password} hint="At least 10 characters" />
		<button class="btn-primary w-full">Create owner account</button>
	</form>
</AuthCard>
