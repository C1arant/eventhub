<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { data, form } = $props();
	const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
	const err = (name: string): Record<string, string> | undefined => (form?.form === name ? form.errors : undefined);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	let copied = $state('');

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = ''), 2000);
		} catch {
			/* clipboard unavailable; the link is selectable */
		}
	}
	const statusCls: Record<string, string> = {
		active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
		revoked: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
		expired: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
	};
	const base = $derived(`/events/${page.params.id}`);
</script>

{#snippet revealed(url: string, key: string, label: string)}
	<div class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
		<p class="text-sm">{label} Copy it now: it is shown only once and cannot be shown again.</p>
		<div class="mt-2 flex gap-2">
			<input readonly value={url} aria-label={label} onfocus={(e) => e.currentTarget.select()}
				class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
			<button type="button" class="btn-secondary" onclick={() => copy(url, key)}>{copied === key ? 'Copied' : 'Copy'}</button>
		</div>
	</div>
{/snippet}

<h2 class="sr-only">People</h2>
<p class="text-sm"><a href="{base}/callsheet" class="text-indigo-600 hover:underline dark:text-indigo-400">View call sheet</a></p>

{#if data.assigned.length === 0}
	<p class="mt-4 text-sm text-slate-500">Nobody is assigned to this event yet.{data.canManage ? ' Add someone below.' : ''}</p>
{/if}

<ul class="mt-4 space-y-4">
	{#each data.assigned as a (a.assignmentId)}
		{@const mine = data.links.filter((l) => l.assignmentId === a.assignmentId)}
		<li class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h3 class="font-semibold">{a.name}{#if a.isShowCaller}<span class="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-normal text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">Show caller</span>{/if}</h3>
				<p class="text-sm text-slate-500">{[a.phone, a.email].filter(Boolean).join(' · ')}</p>
			</div>

			{#if !data.canManage}
				<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt class="text-slate-500">Role</dt><dd>{a.eventRole || '-'}</dd>
					<dt class="text-slate-500">Call</dt><dd>{a.callTime ?? '-'}</dd>
					{#each a.dayCalls as d (d.dayId)}<dt class="text-slate-500">{d.dayLabel}</dt><dd>{d.callTime}</dd>{/each}
				</dl>
			{:else}
				<form method="POST" action="?/update" use:enhance={keep} class="mt-2 space-y-2">
					<input type="hidden" name="assignmentId" value={a.assignmentId} />
					<div class="grid gap-2 sm:grid-cols-2">
						<label class="block"><span class="text-xs text-slate-500">Role</span>
							<input name="eventRole" value={a.eventRole} class={inp} /></label>
						<label class="block"><span class="text-xs text-slate-500">Call time</span>
							<input name="callTime" type="time" value={a.callTime ?? ''} class={inp} /></label>
					</div>
					{#if data.days.length > 1}
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each data.days as d (d.id)}
								<label class="block"><span class="text-xs text-slate-500">{d.label} call</span>
									<input name="dayCall_{d.id}" type="time" value={a.dayCalls.find((c) => c.dayId === d.id)?.callTime ?? ''} class={inp} /></label>
							{/each}
						</div>
					{/if}
					<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="isShowCaller" checked={a.isShowCaller} class="size-4" /> Show caller (can run live mode)</label>
					{#each Object.values(err(`a${a.assignmentId}`) ?? {}) as m (m)}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
					<div class="flex flex-wrap gap-2">
						<button class="btn-secondary">Save</button>
						{#if form?.form === `a${a.assignmentId}` && form.saved}<span class="self-center text-sm text-emerald-600" role="status">Saved.</span>{/if}
					</div>
				</form>
				<form method="POST" action="?/unassign" use:enhance onsubmit={(e) => { if (!confirm(`Remove ${a.name} from this event? Their guest links will stop working.`)) e.preventDefault(); }} class="mt-2">
					<input type="hidden" name="assignmentId" value={a.assignmentId} />
					<button class="text-sm text-red-700 hover:underline dark:text-red-400">Remove from event</button>
				</form>

				<div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
					<h4 class="text-sm font-semibold">Crew login</h4>
					{#if a.hasLogin}
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">Has login</p>
					{:else}
						<form method="POST" action="?/invite" use:enhance={keep} class="mt-1">
							<input type="hidden" name="assignmentId" value={a.assignmentId} />
							<button class="btn-secondary" disabled={!a.email} title={a.email ? '' : 'Add an email to this person first'}>Send crew invite</button>
							{#if !a.email}<span class="ml-2 text-xs text-slate-500">Needs an email address.</span>{/if}
						</form>
						{#each Object.values(err(`invite${a.assignmentId}`) ?? {}) as m (m)}<p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
						{#if form?.form === `invite${a.assignmentId}` && form.newInvite}
							{@render revealed(form.newInvite, `invite${a.assignmentId}`, `Invite for ${form.inviteEmail}.`)}
						{/if}
					{/if}
				</div>

				<div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
					<h4 class="text-sm font-semibold">Guest links</h4>
					{#if mine.length > 0}
						<ul class="mt-1 divide-y divide-slate-200 text-sm dark:divide-slate-800">
							{#each mine as l (l.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<span class="rounded-full px-2 py-0.5 text-xs {statusCls[l.status]}">{l.status}</span>
									<span>{l.liveAccess ? 'Live access' : 'No live access'}</span>
									<span class="text-slate-500">expires {l.expiresDate}{l.contactName ? ` · contact ${l.contactName}` : ''}</span>
									{#if l.status === 'active'}
										<form method="POST" action="?/revokeLink" use:enhance class="ml-auto" onsubmit={(e) => { if (!confirm('Revoke this link? It stops working immediately.')) e.preventDefault(); }}>
											<input type="hidden" name="linkId" value={l.id} />
											<button class="text-red-700 hover:underline dark:text-red-400">Revoke</button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<details class="mt-1">
						<summary class="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400">Create guest link</summary>
						<form method="POST" action="?/createLink" use:enhance={keep} class="mt-2 space-y-2">
							<input type="hidden" name="assignmentId" value={a.assignmentId} />
							<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="liveAccess" class="size-4" /> Allow live view</label>
							<label class="block"><span class="text-xs text-slate-500">Contact person</span>
								<select name="contactPersonId" class={inp}>
									<option value="">None</option>
									{#each data.assigned as c (c.personId)}<option value={c.personId}>{c.name}</option>{/each}
								</select></label>
							<label class="block"><span class="text-xs text-slate-500">Expires (blank: 7 days after the event ends)</span>
								<input name="expires" type="date" class={inp} /></label>
							{#each Object.values(err(`link${a.assignmentId}`) ?? {}) as m (m)}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
							<button class="btn-secondary">Create link</button>
						</form>
					</details>
					{#if form?.form === `link${a.assignmentId}` && form.newLink}
						{@render revealed(form.newLink, `link${a.assignmentId}`, `Guest link for ${a.name}.`)}
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

{#if data.canManage}
	<section class="mt-8 max-w-lg">
		<h2 class="text-lg font-semibold">Assign someone</h2>
		{#if data.available.length === 0}
			<p class="mt-2 text-sm text-slate-500">Everyone in the directory is already assigned. <a href="/people" class="text-indigo-600 hover:underline dark:text-indigo-400">Add people</a> first.</p>
		{:else}
			<form method="POST" action="?/assign" use:enhance class="mt-2 space-y-2">
				<label class="block"><span class="text-xs text-slate-500">Person</span>
					<select name="personId" required class={inp}>
						{#each data.available as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select></label>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="block"><span class="text-xs text-slate-500">Role</span><input name="eventRole" placeholder="FOH engineer" class={inp} /></label>
					<label class="block"><span class="text-xs text-slate-500">Call time</span><input name="callTime" type="time" class={inp} /></label>
				</div>
				{#each Object.values(err('assign') ?? {}) as m (m)}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
				<button class="btn-primary">Assign</button>
			</form>
		{/if}
	</section>
{/if}
