<script lang="ts">
	import { EmptyState } from '$lib/components';
</script>

<svelte:head><title>Reports · Hourtrail</title></svelte:head>
<section class="reports">
	<header><h1>Reports</h1></header>
	<EmptyState message="Your time reports will appear here." />
</section>

<style>
	.reports {
		max-width: var(--ht-content-max);
	}

	h1 {
		margin: 0 0 var(--ht-space-5);
		font: var(--ht-type-title);
	}
</style>
