<script lang="ts">
	import { onMount } from 'svelte';
	import { fmtClock, fmtOverUnder } from '#lib/live-format.js';

	type Item = { id: number; title: string; type: string; durationSec: number; people?: string | null; clock?: string };
	export type Snap = {
		state: { status: 'idle' | 'running' | 'held' | 'finished'; currentStartedAt: number | null; version: number };
		now: Item | null;
		next: Item | null;
		after: Item | null;
		remainingSec: number | null;
		overUnderSec: number;
		serverNow: number;
	};

	let { snap, big = false }: { snap: Snap; big?: boolean } = $props();

	// Skew between server and this device, measured when each snapshot arrives.
	let skewMs = $state(0);
	let tick = $state(Date.now());
	$effect.pre(() => {
		skewMs = snap.serverNow - Date.now();
	});
	onMount(() => {
		const t = setInterval(() => (tick = Date.now()), 250);
		return () => clearInterval(t);
	});

	const running = $derived(snap.state.status === 'running' && snap.now !== null && snap.state.currentStartedAt !== null);
	const remaining = $derived.by(() => {
		if (snap.remainingSec === null || !snap.now) return null;
		if (!running) return snap.remainingSec; // held: frozen
		const end = snap.state.currentStartedAt! + snap.now.durationSec * 1000;
		return Math.round((end - (tick + skewMs)) / 1000);
	});
	const overUnder = $derived.by(() => {
		let v = snap.overUnderSec;
		// Once the item overruns, lateness grows one-for-one with the clock.
		if (running && remaining !== null && snap.remainingSec !== null) {
			v += Math.max(0, -remaining) - Math.max(0, -snap.remainingSec);
		}
		return v;
	});
	const ou = $derived(fmtOverUnder(overUnder));
	const over = $derived(remaining !== null && remaining < 0);
	const tone = { late: 'text-red-500', early: 'text-emerald-500', ontime: 'opacity-70' };
	const tag = (t: string) => t.replaceAll('_', ' ');
</script>

<section class="space-y-4" aria-live="polite">
	{#if snap.state.status === 'idle'}
		<p class="rounded-lg bg-slate-500/20 px-4 py-2 text-center font-semibold uppercase tracking-wide">Not started</p>
	{:else if snap.state.status === 'held'}
		<p class="rounded-lg bg-amber-500/30 px-4 py-2 text-center font-bold uppercase tracking-wide text-amber-500">HOLD</p>
	{:else if snap.state.status === 'finished'}
		<p class="rounded-lg bg-emerald-500/20 px-4 py-2 text-center font-semibold uppercase tracking-wide text-emerald-500">Finished</p>
	{/if}

	{#if snap.now}
		<div class="rounded-2xl border border-current/20 p-4 text-center">
			<p class="text-xs font-semibold uppercase tracking-widest opacity-60">Now</p>
			<h2 class="font-bold {big ? 'text-6xl' : 'text-2xl'}">{snap.now.title}</h2>
			<p class="mt-1 {big ? 'text-3xl' : 'text-sm'} opacity-70">
				<span class="rounded bg-slate-500/25 px-2 py-0.5 uppercase">{tag(snap.now.type)}</span>
				{#if snap.now.people}<span class="ml-2">{snap.now.people}</span>{/if}
			</p>
			{#if remaining !== null}
				<p class="mt-2 font-mono font-bold tabular-nums {big ? 'text-[10rem] leading-none' : 'text-7xl'} {over ? 'text-red-500' : ''}">
					{#if over}+{fmtClock(-remaining)}<span class="{big ? 'text-5xl' : 'text-xl'} ml-2 font-semibold">over</span>{:else}{fmtClock(remaining)}{/if}
				</p>
			{/if}
		</div>
	{/if}

	{#if snap.next}
		<div class="rounded-xl border border-current/10 p-3">
			<p class="text-xs font-semibold uppercase tracking-widest opacity-60">Next</p>
			<p class="font-semibold {big ? 'text-5xl' : 'text-lg'}">{snap.next.title}
				<span class="font-normal opacity-60 {big ? 'text-3xl' : 'text-sm'}">{Math.round(snap.next.durationSec / 60)} min</span></p>
		</div>
	{/if}
	{#if snap.after}
		<div class="rounded-xl border border-current/10 p-3 opacity-70">
			<p class="text-xs font-semibold uppercase tracking-widest opacity-60">After</p>
			<p class="{big ? 'text-4xl' : 'text-base'}">{snap.after.title}</p>
		</div>
	{/if}

	{#if snap.state.status === 'running' || snap.state.status === 'held' || snap.state.status === 'finished'}
		<p class="text-center font-semibold {big ? 'text-5xl' : 'text-lg'} {tone[ou.tone]}">{ou.text}</p>
	{/if}
</section>
