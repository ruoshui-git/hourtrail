<script module lang="ts">
	import type { Component } from 'svelte';

	export type MenuItem = {
		label: string;
		icon?: Component;
		danger?: boolean;
		disabled?: boolean;
		onselect: () => void;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import { Ellipsis } from '@lucide/svelte';

	let {
		open = $bindable(false),
		label,
		items,
		trigger,
	}: {
		open?: boolean;
		label: string;
		items: MenuItem[];
		trigger?: Snippet<[props: Record<string, unknown>]>;
	} = $props();
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{#if trigger}
				{@render trigger(props)}
			{:else}
				<button type="button" class="trigger" aria-label={label} {...props}>
					<Ellipsis aria-hidden="true" />
				</button>
			{/if}
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content class="menu" align="end" sideOffset={4}>
			{#each items as item (item.label)}
				{@const Icon = item.icon}
				<DropdownMenu.Item
					class={item.danger ? 'menu-item danger' : 'menu-item'}
					disabled={item.disabled}
					onSelect={() => item.onselect()}
				>
					{#if Icon}<span class="icon" aria-hidden="true"><Icon /></span>{/if}
					<span class="text">{item.label}</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	.trigger {
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

	.trigger :global(svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	@media (hover: hover) {
		.trigger:hover {
			background: var(--ht-hover);
		}
	}

	.trigger:active {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}

	:global(.menu) {
		z-index: var(--ht-z-menu);

		/* The highlighted item carries the focus state; the container needs no ring. */
		outline: none;
		display: grid;
		gap: var(--ht-space-1);
		min-width: calc(var(--ht-target) * 4);
		padding: var(--ht-space-1);
		border: var(--ht-hairline) solid var(--ht-overlay-border);
		border-radius: var(--ht-radius-control);
		background: var(--ht-surface);
		box-shadow: var(--ht-shadow-overlay);
		color: var(--ht-ink);
		animation: menu-in var(--ht-duration-sheet) var(--ht-ease);
	}

	:global(.menu[data-state='closed']) {
		animation: menu-out var(--ht-duration-sheet) var(--ht-ease) forwards;
	}

	:global(.menu-item) {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-3);
		border-radius: var(--ht-radius-control);
		font: var(--ht-type-body);
		color: var(--ht-ink);
		cursor: default;
		user-select: none;
	}

	:global(.menu-item[data-highlighted]) {
		background: var(--ht-hover);
		outline: none;
	}

	:global(.menu-item[data-disabled]) {
		color: var(--ht-ink-3);
		cursor: default;
	}

	:global(.menu-item.danger) {
		color: var(--ht-danger);
	}

	:global(.menu-item .icon) {
		display: inline-flex;
		flex: none;
	}

	:global(.menu-item .icon svg) {
		width: var(--ht-icon);
		height: var(--ht-icon);
		stroke-width: var(--ht-icon-stroke);
	}

	:global(.menu-item .text) {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.menu) {
			animation-name: fade-in;
		}

		:global(.menu[data-state='closed']) {
			animation-name: fade-out;
		}
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			translate: 0 calc(-1 * var(--ht-space-1));
		}
	}

	@keyframes menu-out {
		to {
			opacity: 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}
</style>
