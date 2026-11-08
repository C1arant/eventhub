<script lang="ts">
	import { formatDate } from '#lib/event-meta.js';

	let { data } = $props();
	const depts = ['sound', 'lighting', 'video', 'stage'] as const;
	const cols = $derived(data.dept ? [data.dept] : depts);
	const note = (t: (typeof data.items)[number], d: (typeof depts)[number]) =>
		({ sound: t.notesSound, lighting: t.notesLighting, video: t.notesVideo, stage: t.notesStage })[d];
	const label = (t: string) => t.replaceAll('_', ' ');
</script>

<svelte:head><title>{data.eventName} run-of-show</title></svelte:head>

<div class="sheet">
	<header>
		<h1>{data.eventName}: {data.day.label || formatDate(data.day.date)}</h1>
		<p>{formatDate(data.day.date)} · starts {data.day.startTime}{data.dept ? ` · ${data.dept} copy` : ''}</p>
		<p class="noprint"><a href="/events/{data.eventId}/run-of-show?day={data.day.id}">Back to editor</a> · <button onclick={() => window.print()}>Print</button></p>
	</header>
	<table>
		<thead>
			<tr>
				<th>Time</th><th>Item</th><th>Min</th><th>People</th>
				{#each cols as c (c)}<th class="cap">{c}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each data.items as t (t.id)}
				<tr>
					<td class="mono">{t.clock}{#if t.dayOffset >= 1} <b>+{t.dayOffset}</b>{/if}</td>
					<td><b>{t.title}</b><br /><small>{label(t.type)}</small>{#if t.conflict}<br /><small class="warn">Overlap: hard start before previous item ends</small>{/if}</td>
					<td>{Math.round(t.durationSec / 60)}</td>
					<td>{t.people}</td>
					{#each cols as c (c)}<td class="pre">{note(t, c)}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if data.items.length === 0}<p>No items.</p>{/if}
</div>

<style>
	.sheet { background: #fff; color: #000; min-height: 100vh; padding: 1.5rem; font-family: system-ui, sans-serif; }
	h1 { font-size: 1.4rem; margin: 0; }
	header p { margin: 0.25rem 0 0.75rem; }
	table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
	th, td { border: 1px solid #000; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
	.cap { text-transform: capitalize; }
	.mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
	.pre { white-space: pre-wrap; }
	.warn { font-weight: bold; }
	a { color: #000; }
	@media print {
		.noprint { display: none; }
		.sheet { padding: 0; }
		tr { break-inside: avoid; }
	}
</style>
