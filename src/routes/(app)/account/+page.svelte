<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Account · EventHub</title></svelte:head>

<h1 class="text-2xl font-bold">Account</h1>
<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{data.account.name} · {data.account.email} · {data.account.role}</p>

<section class="mt-8">
	<h2 class="text-lg font-semibold">Sessions</h2>
	<p class="text-sm text-slate-600 dark:text-slate-400">Sign out of every device where you are logged in.</p>
	<form method="POST" action="/logout?/everywhere" class="mt-2">
		<button class="btn-secondary">Log out everywhere</button>
	</form>
</section>
