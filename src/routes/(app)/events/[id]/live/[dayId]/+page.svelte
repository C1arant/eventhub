<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import LiveBoard, { type Snap } from '#lib/components/LiveBoard.svelte';
	import { createLiveClient } from '#lib/live-client.js';

	let { data, form } = $props();
	let snap = $state<Snap>(untrack(() => data.snapshot) as Snap);
	const dayId = $derived(data.day.id);
	let status = $state<'connected' | 'reconnecting' | 'denied'>('connected');
	let toast = $state('');
	let busy = $state(false);
	let qTitle = $state('');
	let qMin = $state(5);
	let copied = $state(false);
	let toastTimer: ReturnType<typeof setTimeout>;

	const apply = (s: Snap) => {
		if (s.state.version >= snap.state.version) snap = s;
	};
	// Re-runs only when the day changes (the derived value is stable across data reloads).
	$effect(() => {
		const id = dayId;
		snap = untrack(() => data.snapshot) as Snap;
		const c = createLiveClient<Snap>(`/live/${id}/stream`, apply, (s) => (status = s), `/live/${id}/check`);
		return () => c.close();
	});

	function say(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 3500);
	}

	async function send(action: Record<string, unknown>): Promise<boolean> {
		if (busy || !data.canControl) return false;
		busy = true;
		try {
			const res = await fetch(`/live/${data.day.id}/action`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, version: snap.state.version })
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 409) {
				say('Already advanced');
				if (body.snapshot) snap = body.snapshot;
				return false;
			}
			if (!res.ok) {
				say(body.message ?? 'That did not work');
				return false;
			}
			if (body.snapshot) apply(body.snapshot);
			return true;
		} catch {
			say('Could not reach the server');
			return false;
		} finally {
			busy = false;
		}
	}

	const st = $derived(snap.state.status);
	const live = $derived(st === 'running' || st === 'held');

	function onKey(e: KeyboardEvent) {
		if (!data.canControl || e.metaKey || e.ctrlKey || e.altKey) return;
		const el = e.target as HTMLElement | null;
		if (el && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName)) return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (st === 'idle' || live) send({ type: st === 'idle' ? 'start' : 'next' });
		} else if (e.key === 'h' || e.key === 'H') {
			if (live) send({ type: st === 'held' ? 'resume' : 'hold' });
		}
	}
	function finish() {
		if (confirm('Finish the show now?')) send({ type: 'finish' });
	}
	async function quick(e: SubmitEvent) {
		e.preventDefault();
		if (await send({ type: 'insertQuickItem', title: qTitle.trim(), durationSec: Math.round(qMin * 60) })) qTitle = '';
	}
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* the field is selectable as a fallback */
		}
	}
	const btn = 'rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold disabled:opacity-40 dark:border-slate-700';
	const inp = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900';
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Live · {data.day.label || 'Day'} · EventHub</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-4">
	<div class="flex items-center gap-2">
		<h2 class="flex-1 text-lg font-semibold">{data.day.label || 'Day'} · {data.day.date}</h2>
		{#if status === 'denied'}
			<span class="rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-600">You no longer have access</span>
		{:else if status === 'reconnecting'}
			<span class="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-600">Reconnecting…</span>
		{/if}
		<a class="text-sm text-indigo-600 underline" href="{data.day.id}/display" target="_blank" rel="noopener">Full-screen display</a>
		<a class="text-sm text-indigo-600 underline" href="{data.day.id}/report">Report</a>
	</div>

	{#if toast}
		<div role="status" class="rounded-lg bg-slate-800 px-4 py-2 text-center text-white">{toast}</div>
	{/if}

	<LiveBoard {snap} />

	{#if data.canControl}
		<div class="space-y-3">
			{#if st === 'idle'}
				<button class="w-full rounded-2xl bg-indigo-600 py-8 text-3xl font-bold text-white disabled:opacity-40" disabled={busy} onclick={() => send({ type: 'start' })}>Start</button>
			{:else if live}
				<button class="w-full rounded-2xl bg-indigo-600 py-8 text-3xl font-bold text-white disabled:opacity-40" disabled={busy} onclick={() => send({ type: 'next' })}>Next</button>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<button class={btn} disabled={busy} onclick={() => send({ type: 'back' })}>Back</button>
					<button class={btn} disabled={busy} onclick={() => send({ type: 'skip' })}>Skip</button>
					<button class={btn} disabled={busy} onclick={() => send({ type: st === 'held' ? 'resume' : 'hold' })}>{st === 'held' ? 'Resume' : 'Hold'}</button>
					<button class="{btn} text-red-600" disabled={busy} onclick={finish}>Finish</button>
				</div>
				<form class="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800" onsubmit={quick}>
					<label class="min-w-0 flex-1 text-sm">Quick insert after current
						<input class={inp} bind:value={qTitle} maxlength="200" required placeholder="Title" />
					</label>
					<label class="w-24 text-sm">Minutes
						<input class={inp} type="number" min="1" max="1440" bind:value={qMin} required />
					</label>
					<button class={btn} disabled={busy}>Insert</button>
				</form>
				<p class="text-xs text-slate-500">Keyboard: Space = Next, H = Hold/Resume</p>
			{/if}
		</div>
	{:else}
		<p class="text-center text-sm text-slate-500">View only</p>
	{/if}

	{#if data.isOwner}
		<section class="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
			<h3 class="font-semibold">Stage display link</h3>
			<form method="POST" action="?/createDisplay" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<button class={btn}>Create display link</button>
			</form>
			{#if form?.displayUrl}
				<p class="text-sm">Shown once, so copy it now:</p>
				<div class="flex gap-2">
					<input class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" readonly value={form.displayUrl} onfocus={(e) => e.currentTarget.select()} />
					<button class={btn} type="button" onclick={() => copy(form.displayUrl)}>{copied ? 'Copied' : 'Copy'}</button>
				</div>
				<p class="text-xs text-slate-500">Add <code>?obs=1</code> for a transparent background (OBS browser source).</p>
			{/if}
			{#if data.displayTokens.length}
				<ul class="divide-y divide-slate-200 text-sm dark:divide-slate-800">
					{#each data.displayTokens as t (t.id)}
						<li class="flex items-center gap-2 py-2">
							<span class="flex-1">Display link created {new Date(t.createdAt).toLocaleString()}</span>
							<form method="POST" action="?/revokeDisplay" use:enhance={() => async ({ update }) => update({ reset: false })}>
								<input type="hidden" name="id" value={t.id} />
								<button class="text-red-600 underline">Revoke</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
