<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	let {
		color,
		size = 'md',
		archived = false,
	}: { color: BlazeKey; size?: 'sm' | 'md' | 'lg'; archived?: boolean } = $props();
</script>

<span
	class="blaze {size}"
	class:archived
	style:--blaze={`var(--ht-blaze-${color})`}
	aria-hidden="true"
></span>

<style>
	.blaze {
		display: inline-block;
		flex: none;
		width: var(--ht-blaze-md-w);
		height: var(--ht-blaze-md-h);
		border-radius: var(--ht-radius-blaze);
		background: var(--blaze);
	}

	.sm {
		width: var(--ht-blaze-sm-w);
		height: var(--ht-blaze-sm-h);
	}

	.lg {
		width: var(--ht-blaze-lg-w);
		height: var(--ht-blaze-lg-h);
	}

	.archived {
		background: transparent;
		border: var(--ht-hairline) solid var(--blaze);
	}
</style>
