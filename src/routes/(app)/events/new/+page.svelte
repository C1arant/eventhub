<script lang="ts">
	import EventForm from '#lib/components/EventForm.svelte';
	let { data, form } = $props();
	const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900';
	const tv = $derived((form?.tplValues ?? {}) as Record<string, string>);
	const te = $derived((form?.tplErrors ?? {}) as Record<string, string>);
</script>

<svelte:head><title>New event · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">New event</h1>

{#if data.templates.length > 0}
	<section class="mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="font-semibold">From template</h2>
		<form method="POST" action="?/fromTemplate" class="mt-3 space-y-3">
			<label class="block"><span class="mb-1 block text-sm font-medium">Template</span>
				<select name="templateId" class={input} value={tv.templateId ?? ''}>
					{#each data.templates as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
				</select>
				{#if te.templateId}<span class="mt-1 block text-sm text-red-600">{te.templateId}</span>{/if}
			</label>
			<label class="block"><span class="mb-1 block text-sm font-medium">Name</span>
				<input name="name" required value={tv.name ?? ''} class={input} />
				{#if te.name}<span class="mt-1 block text-sm text-red-600">{te.name}</span>{/if}
			</label>
			<label class="block"><span class="mb-1 block text-sm font-medium">Start date</span>
				<input name="startDate" type="date" required value={tv.startDate ?? ''} class={input} />
				{#if te.startDate}<span class="mt-1 block text-sm text-red-600">{te.startDate}</span>{/if}
			</label>
			{#if te._form}<p class="text-sm text-red-600" role="alert">{te._form}</p>{/if}
			<button class="btn-primary">Create from template</button>
		</form>
	</section>
	<h2 class="mt-8 font-semibold">Or start blank</h2>
{/if}

<form method="POST" action="?/create" class="mt-4 max-w-lg">
	<EventForm values={form?.values} errors={form?.errors} submit="Create event" />
</form>
