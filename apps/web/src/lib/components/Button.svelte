<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		busy = false,
		wide = false,
		icon: Icon,
		onclick,
		children,
	}: {
		variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
		size?: 'lg' | 'md' | 'sm';
		type?: 'button' | 'submit';
		disabled?: boolean;
		busy?: boolean;
		wide?: boolean;
		icon?: Component;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	} = $props();
</script>

<button
	class="{variant} {size}"
	class:wide
	{type}
	disabled={disabled || busy}
	aria-busy={busy}
	onclick={(event) => {
		if (!disabled && !busy) onclick?.(event);
	}}
>
	{#if Icon}<span class="icon" aria-hidden="true"><Icon /></span>{/if}
	{@render children()}
</button>

<style>
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--ht-space-2);
		min-width: var(--ht-target);
		min-height: var(--ht-button-md);
		padding: var(--ht-space-2) var(--ht-space-4);
		border: var(--ht-hairline) solid transparent;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
		transition:
			background var(--ht-duration-press) var(--ht-ease),
			transform var(--ht-duration-press) var(--ht-ease);
		overflow-wrap: anywhere;
	}

	.primary {
		background: var(--ht-ink);
		color: var(--ht-paper);
	}

	.secondary {
		border-color: var(--ht-line-strong);
	}

	.danger {
		color: var(--ht-danger);
		border-color: var(--ht-danger);
	}

	.lg {
		min-height: var(--ht-button-lg);
	}

	.wide {
		width: 100%;
	}

	.icon {
		flex: none;
	}

	.icon :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	button:disabled {
		cursor: default;
		color: var(--ht-ink-3);
		border-color: var(--ht-line);
	}

	.primary:disabled {
		background: var(--ht-sunken);
		border-color: transparent;
	}

	@media (hover: hover) {
		button:hover:enabled {
			background: var(--ht-hover);
		}

		.primary:hover:enabled {
			background: var(--ht-ink-hover);
		}
	}

	button:active:enabled {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}

	.primary:active:enabled {
		background: var(--ht-ink-hover);
	}

	@media (width >= 1024px) {
		.sm {
			min-height: var(--ht-button-sm);
			padding-block: var(--ht-space-1);
			position: relative;
		}

		.sm::after {
			content: '';
			position: absolute;
			inset: calc((var(--ht-button-sm) - var(--ht-target)) / 2) 0;
		}
	}
</style>
