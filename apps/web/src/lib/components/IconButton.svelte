<script lang="ts">
	import type { Component } from 'svelte';
	let {
		label,
		icon: Icon,
		variant = 'quiet',
		disabled = false,
		onclick,
	}: {
		label: string;
		icon: Component;
		variant?: 'quiet' | 'secondary';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
	} = $props();
</script>

<button
	type="button"
	aria-label={label}
	class:secondary={variant === 'secondary'}
	{disabled}
	{onclick}><span aria-hidden="true"><Icon /></span></button
>

<style>
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--ht-target);
		height: var(--ht-target);
		padding: 0;
		border: var(--ht-hairline) solid transparent;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
		transition:
			background var(--ht-duration-press) var(--ht-ease),
			transform var(--ht-duration-press) var(--ht-ease);
	}

	.secondary {
		border-color: var(--ht-line-strong);
	}

	button :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	button:disabled {
		color: var(--ht-ink-3);
		cursor: default;
	}

	@media (hover: hover) {
		button:hover:enabled {
			background: var(--ht-hover);
		}
	}

	button:active:enabled {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}

	.secondary:disabled {
		border-color: var(--ht-line);
	}
</style>
