<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import IconButton from './IconButton.svelte';
	function close() {
		open = false;
		onclose?.();
	}

	let {
		open = $bindable(false),
		title,
		description,
		children,
		footer,
		onclose,
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	} = $props();
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onclose?.();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="scrim" />
		<Dialog.Content class="sheet">
			<header>
				<div class="heading">
					<Dialog.Title class="ht-overlay-title">{title}</Dialog.Title>
					{#if description}<Dialog.Description class="description">{description}</Dialog.Description
						>{/if}
				</div>
				<IconButton label="Close" icon={X} onclick={close} />
			</header>
			<div class="body">{@render children()}</div>
			{#if footer}<footer>{@render footer()}</footer>{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.scrim) {
		position: fixed;
		inset: 0;
		z-index: var(--ht-z-sheet);
		background: var(--ht-scrim);
		animation: fade-in var(--ht-duration-sheet) var(--ht-ease);
	}

	:global(.scrim[data-state='closed']) {
		animation: fade-out var(--ht-duration-sheet) var(--ht-ease) forwards;
	}

	:global(.sheet) {
		position: fixed;
		z-index: var(--ht-z-sheet);
		inset: auto 0 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--ht-space-4);
		width: 100%;
		max-height: 90dvh;
		padding: var(--ht-space-4) var(--ht-gutter)
			calc(var(--ht-space-5) + env(safe-area-inset-bottom));
		overflow: hidden;
		border-top-left-radius: var(--ht-radius-sheet);
		border-top-right-radius: var(--ht-radius-sheet);
		background: var(--ht-surface);
		box-shadow: var(--ht-shadow-overlay);
		border: var(--ht-hairline) solid var(--ht-overlay-border);
		border-bottom: 0;
		color: var(--ht-ink);
		animation: sheet-in var(--ht-duration-sheet) var(--ht-ease);
	}

	:global(.sheet[data-state='closed']) {
		animation: sheet-out var(--ht-duration-sheet) var(--ht-ease) forwards;
	}

	@media (width >= 768px) {
		:global(.sheet) {
			inset: 0;
			margin: auto;
			width: min(var(--ht-dialog-max), 100% - 2 * var(--ht-gutter));
			min-width: min(var(--ht-dialog-min), 100% - 2 * var(--ht-gutter));
			height: fit-content;
			max-height: calc(100dvh - 2 * var(--ht-gutter));
			padding-bottom: var(--ht-space-5);
			border-radius: var(--ht-radius-sheet);
			border-bottom: var(--ht-hairline) solid var(--ht-overlay-border);
			animation: fade-in var(--ht-duration-sheet) var(--ht-ease);
		}

		:global(.sheet[data-state='closed']) {
			animation: fade-out var(--ht-duration-sheet) var(--ht-ease) forwards;
		}
	}

	header {
		display: flex;
		align-items: start;
		gap: var(--ht-space-3);
		min-width: 0;
	}

	.heading {
		display: grid;
		gap: var(--ht-space-1);
		flex: 1;
		min-width: 0;
	}

	:global(.ht-overlay-title) {
		font: var(--ht-type-heading);
		color: var(--ht-ink);
		overflow-wrap: anywhere;
	}

	.heading :global(.description) {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	.body {
		min-height: 0;
		overflow-y: auto;
		display: grid;
		gap: var(--ht-space-4);
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--ht-space-3);
	}

	footer :global(button) {
		flex: 1 1 auto;
	}

	@media (width >= 768px) {
		footer :global(button) {
			flex: none;
		}
	}

	@keyframes sheet-in {
		from {
			translate: 0 100%;
		}
	}

	@keyframes sheet-out {
		to {
			translate: 0 100%;
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

	/* Reduced motion: opacity only, same duration. */
	@media (prefers-reduced-motion: reduce) {
		:global(.sheet) {
			animation-name: fade-in;
		}

		:global(.sheet[data-state='closed']) {
			animation-name: fade-out;
		}
	}
</style>
