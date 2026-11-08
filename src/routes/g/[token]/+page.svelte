<script lang="ts">
	let { data } = $props();
	const v = $derived(data.view);
	const maps = $derived(
		v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}` : ''
	);
	const dateRange = $derived(
		v.days.length === 0 ? '' : v.days.length === 1 ? v.days[0].date : `${v.days[0].date} to ${v.days[v.days.length - 1].date}`
	);
	const liveDays = $derived(v.days.filter((d) => v.liveDays.includes(d.id)));
</script>

<svelte:head>
	<title>{v.eventName}</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto max-w-lg space-y-5 p-4 pb-10">
	<header>
		<h1 class="text-2xl font-bold">{v.eventName}</h1>
		{#if dateRange}<p class="text-neutral-600">{dateRange}</p>{/if}
	</header>

	{#if v.venue || v.address}
		<section class="rounded-lg border border-neutral-200 p-4">
			<h2 class="mb-1 text-sm font-semibold uppercase text-neutral-500">Where</h2>
			{#if v.venue}<p class="font-medium">{v.venue}</p>{/if}
			{#if v.address}
				<p>{v.address}</p>
				<a class="mt-2 inline-block text-blue-700 underline" href={maps} target="_blank" rel="noopener noreferrer">Open in Maps</a>
			{/if}
		</section>
	{/if}

	{#if v.callTime || v.dayCalls.length}
		<section class="rounded-lg border border-neutral-200 p-4">
			<h2 class="mb-1 text-sm font-semibold uppercase text-neutral-500">Your call time</h2>
			{#if v.callTime}<p class="text-xl font-semibold">{v.callTime}</p>{/if}
			{#each v.dayCalls as c (c.dayId)}
				<p>{c.dayLabel} ({c.date}): <span class="font-semibold">{c.callTime}</span></p>
			{/each}
		</section>
	{/if}

	{#if v.mySlots.length}
		<section class="rounded-lg border border-neutral-200 p-4">
			<h2 class="mb-1 text-sm font-semibold uppercase text-neutral-500">Your slots</h2>
			<ul class="space-y-2">
				{#each v.mySlots as s, i (i)}
					<li>
						<span class="font-semibold">{s.clock}{s.dayOffset ? ` (+${s.dayOffset})` : ''}</span>
						{s.title} <span class="text-neutral-500">({s.durationMin} min, {s.dayLabel})</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if v.contact}
		<section class="rounded-lg border border-neutral-200 p-4">
			<h2 class="mb-1 text-sm font-semibold uppercase text-neutral-500">Your contact</h2>
			<p class="font-medium">{v.contact.name}</p>
			{#if v.contact.phone}
				<a class="mt-2 inline-block rounded bg-blue-700 px-4 py-2 text-white" href={`tel:${v.contact.phone.replace(/[^\d+]/g, '')}`}>Call {v.contact.phone}</a>
			{/if}
		</section>
	{/if}

	{#if v.files.length}
		<section class="rounded-lg border border-neutral-200 p-4">
			<h2 class="mb-1 text-sm font-semibold uppercase text-neutral-500">Files</h2>
			<ul class="space-y-1">
				{#each v.files as f (f.id)}
					<li><a class="text-blue-700 underline" href={`/g/${encodeURIComponent(data.token)}/files/${f.id}`}>{f.name}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if liveDays.length}
		<section class="space-y-2">
			{#each liveDays as d (d.id)}
				<a class="block rounded-lg bg-green-700 px-4 py-3 text-center font-semibold text-white" href={`/g/${encodeURIComponent(data.token)}/live/${d.id}`}>Watch live: {d.label}</a>
			{/each}
		</section>
	{/if}
</main>
