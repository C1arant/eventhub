<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	function human(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}
	const when = (ms: number) => new Date(ms).toLocaleDateString();
	const inp = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base dark:border-slate-700 dark:bg-slate-900';
</script>

<h2 class="sr-only">Files</h2>

{#if data.canUpload}
	<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="mb-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
		<h3 class="text-sm font-semibold uppercase text-slate-500">Upload a file</h3>
		<label class="block text-sm">File (max 25 MB)
			<input type="file" name="file" required class={inp} />
		</label>
		<label class="block text-sm">Share with a guest (optional)
			<select name="assignmentId" class={inp}>
				<option value="">Nobody (crew only)</option>
				{#each data.assignments as a (a.id)}
					<option value={a.id}>{a.name}</option>
				{/each}
			</select>
		</label>
		{#if form?.error}<p role="alert" class="text-sm text-red-600">{form.error}</p>{/if}
		<button class="btn-primary">Upload</button>
	</form>
{/if}

{#if data.files.length === 0}
	<p class="text-slate-500">No files yet.</p>
{:else}
	<ul class="divide-y divide-slate-200 dark:divide-slate-800">
		{#each data.files as f (f.id)}
			<li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
				<a class="min-w-0 break-all text-indigo-600 hover:underline dark:text-indigo-400" href={`/files/${f.id}`} download>{f.name}</a>
				<span class="text-sm text-slate-500">{human(f.size)} · {when(f.uploadedAt)}</span>
				{#if f.guestName}<span class="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">for {f.guestName}</span>{/if}
				{#if data.canDelete}
					<form method="POST" action="?/delete" class="ml-auto" use:enhance={({ cancel }) => { if (!confirm(`Delete "${f.name}"?`)) cancel(); }}>
						<input type="hidden" name="fileId" value={f.id} />
						<button class="text-sm text-red-600 hover:underline">Delete</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
