<script lang="ts">
	import { STATUS_META } from '#lib/event-meta.js';
	let { status }: { status: string } = $props();
	const m = $derived(STATUS_META[status] ?? { label: status, cls: '' });
</script>

<span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium {m.cls}">{m.label}</span>
