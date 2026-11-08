<script lang="ts">
	import EventForm from '#lib/components/EventForm.svelte';
	let { form } = $props();
</script>

<svelte:head><title>New event · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">New event</h1>
<form method="POST" class="mt-4 max-w-lg">
	<EventForm values={form?.values} errors={form?.errors} submit="Create event" />
</form>
