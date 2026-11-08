<script lang="ts">
	import { enhance } from '$app/forms';

	let { eventId, taskId, status, title }: { eventId: number; taskId: number; status: string; title: string } = $props();
	const done = $derived(status === 'done');
</script>

<!-- One-tap complete: a plain form post that works without JS and is enhanced when JS is present. -->
<form method="POST" action="/events/{eventId}/tasks?/setStatus" use:enhance class="shrink-0">
	<input type="hidden" name="taskId" value={taskId} />
	<input type="hidden" name="status" value={done ? 'todo' : 'done'} />
	<button
		aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
		aria-pressed={done}
		class="flex h-11 w-11 items-center justify-center"
	>
		<span class="flex h-6 w-6 items-center justify-center rounded-md border-2 {done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400'}" aria-hidden="true">{done ? '✓' : ''}</span>
	</button>
</form>
