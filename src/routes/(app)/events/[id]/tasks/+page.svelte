<script lang="ts">
	import { enhance } from '$app/forms';
	import TaskCheck from '#lib/components/TaskCheck.svelte';
	import { formatDate } from '#lib/event-meta.js';

	let { data, form } = $props();
	const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
	const err = (name: string): Record<string, string> | undefined => (form?.form === name ? form.errors : undefined);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

{#snippet taskFields(v: Record<string, string>, id: string)}
	<label class="block"><span class="text-xs text-slate-500">Title</span><input name="title" required value={v.title ?? ''} class={inp} /></label>
	<div class="grid grid-cols-2 gap-2">
		<label class="block"><span class="text-xs text-slate-500">Owner</span>
			<select name="ownerUserId" class={inp}>
				<option value="">Unassigned</option>
				{#each data.owners as o (o.id)}<option value={o.id} selected={String(o.id) === (v.ownerUserId ?? '')}>{o.name}</option>{/each}
				{#if v.ownerUserId && !data.owners.some((o) => String(o.id) === v.ownerUserId)}
					<option value={v.ownerUserId} selected>{v.ownerName || 'Former owner'} (no longer on this event)</option>
				{/if}
			</select></label>
		<label class="block"><span class="text-xs text-slate-500">Priority</span>
			<select name="priority" class={inp}>
				{#each ['low', 'normal', 'high'] as p (p)}<option value={p} selected={p === (v.priority ?? 'normal')}>{p}</option>{/each}
			</select></label>
	</div>
	<fieldset class="grid grid-cols-2 gap-2">
		<legend class="text-xs text-slate-500">Due</legend>
		<label class="block"><span class="sr-only">Mode</span>
			<select name="dueMode" class={inp}><option value="date" selected={!((v.dueOffsetDays ?? '') !== '' || v.dueMode === 'before')}>On date</option><option value="before" selected={(v.dueOffsetDays ?? '') !== '' || v.dueMode === 'before'}>Days before event start</option></select></label>
		<div class="grid grid-cols-2 gap-2">
			<input name="dueDate" type="date" value={v.dueDate ?? ''} aria-label="Due date" class={inp} />
			<input name="dueBefore" type="number" min="0" max="3650" placeholder="N days" value={v.dueOffsetDays ?? v.dueBefore ?? ''} aria-label="Days before event start" class={inp} />
		</div>
	</fieldset>
	<label class="block"><span class="text-xs text-slate-500">Notes</span><textarea name="notes" rows="2" class={inp}>{v.notes ?? ''}</textarea></label>
	{#each Object.values(err(id) ?? {}) as m (m)}<p class="text-sm text-red-600 dark:text-red-400" role="alert">{m}</p>{/each}
{/snippet}

<h2 class="sr-only">Tasks</h2>

{#if data.groups.length === 0}
	<p class="text-sm text-slate-500">No sections yet. {data.canEdit ? 'Add a section to start adding tasks.' : ''}</p>
{/if}

<div class="space-y-6">
	{#each data.groups as g, gi (g.section.id)}
		<section aria-labelledby="sec{g.section.id}">
			<div class="flex items-center gap-2">
				<h3 id="sec{g.section.id}" class="min-w-0 flex-1 truncate text-lg font-semibold">{g.section.name}</h3>
				{#if data.canEdit}
					<details class="relative">
						<summary class="btn-secondary cursor-pointer list-none">Edit</summary>
						<div class="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
							<form method="POST" action="?/renameSection" use:enhance={keep} class="flex gap-2">
								<input type="hidden" name="sectionId" value={g.section.id} />
								<input name="name" required value={g.section.name} aria-label="Section name" class={inp} />
								<button class="btn-secondary">Save</button>
							</form>
							{#each Object.values(err(`section${g.section.id}`) ?? {}) as m (m)}<p class="text-sm text-red-600" role="alert">{m}</p>{/each}
							<form method="POST" action="?/moveSection" use:enhance class="flex gap-2">
								<input type="hidden" name="sectionId" value={g.section.id} />
								<button name="dir" value="up" class="btn-secondary" disabled={gi === 0}>Move up</button>
								<button name="dir" value="down" class="btn-secondary" disabled={gi === data.groups.length - 1}>Move down</button>
							</form>
							<form method="POST" action="?/deleteSection" use:enhance onsubmit={(e) => { if (!confirm(`Delete "${g.section.name}" and its ${g.tasks.length} task(s)?`)) e.preventDefault(); }}>
								<input type="hidden" name="sectionId" value={g.section.id} />
								<button class="btn-secondary text-red-600">Delete section</button>
							</form>
						</div>
					</details>
				{/if}
			</div>

			{#if g.tasks.length === 0}<p class="mt-2 text-sm text-slate-500">No tasks in this section.</p>{/if}
			<ul class="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white empty:hidden dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
				{#each g.tasks as t (t.id)}
					<li>
						<div class="flex items-start gap-1 pr-3">
							{#if data.canEdit}
								<TaskCheck eventId={t.eventId} taskId={t.id} status={t.status} title={t.title} />
							{:else}
								<span class="w-3"></span>
							{/if}
							<details class="min-w-0 flex-1">
								<summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 py-1">
									<span class="min-w-0 flex-1">
										<span class="block truncate font-medium {t.status === 'done' ? 'text-slate-400 line-through' : ''}">{t.title}</span>
										<span class="block truncate text-sm text-slate-500">{t.ownerName ?? 'Unassigned'}{t.status === 'doing' ? ' · In progress' : ''}</span>
									</span>
									{#if t.priority === 'high'}<span class="text-xs font-semibold text-red-600">High</span>{/if}
									{#if t.dueDate}<span class="whitespace-nowrap text-sm text-slate-500">{formatDate(t.dueDate)}</span>{/if}
								</summary>
								{#if data.canEdit}
									<form method="POST" action="?/updateTask" use:enhance={keep} class="space-y-2 pb-3">
										<input type="hidden" name="taskId" value={t.id} />
										{@render taskFields({ title: t.title, ownerUserId: String(t.ownerUserId ?? ''), ownerName: t.ownerName ?? '', priority: t.priority, dueDate: t.dueDate ?? '', dueOffsetDays: t.dueOffsetDays === null ? '' : String(t.dueOffsetDays), notes: t.notes }, `task${t.id}`)}
										<div class="flex gap-2">
											<button class="btn-primary">Save task</button>
											<button class="btn-secondary" formaction="?/setStatus" name="status" value={t.status === 'doing' ? 'todo' : 'doing'}>{t.status === 'doing' ? 'Stop' : 'Start'}</button>
											<button class="btn-secondary text-red-600" formaction="?/deleteTask" onclick={(e) => { if (!confirm('Delete this task?')) e.preventDefault(); }}>Delete</button>
										</div>
									</form>
								{:else if t.notes}
									<p class="whitespace-pre-wrap pb-3 text-sm">{t.notes}</p>
								{/if}
							</details>
						</div>
					</li>
				{/each}
			</ul>

			{#if data.canEdit}
				<details class="mt-2">
					<summary class="btn-secondary inline-block cursor-pointer list-none">Add task</summary>
					<form method="POST" action="?/addTask" use:enhance class="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
						<input type="hidden" name="sectionId" value={g.section.id} />
						{@render taskFields(form?.form === `addTask${g.section.id}` && form.values ? form.values : {}, `addTask${g.section.id}`)}
						<button class="btn-primary">Add task</button>
					</form>
				</details>
			{/if}
		</section>
	{/each}
</div>

{#if data.canEdit}
	<form method="POST" action="?/addSection" use:enhance class="mt-8 flex max-w-md items-end gap-2">
		<label class="flex-1"><span class="block text-xs text-slate-500">New section</span><input name="name" required placeholder="e.g. Production" class={inp} /></label>
		<button class="btn-primary">Add section</button>
	</form>
	{#each Object.values(err('addSection') ?? {}) as m (m)}<p class="mt-1 text-sm text-red-600" role="alert">{m}</p>{/each}
{/if}
