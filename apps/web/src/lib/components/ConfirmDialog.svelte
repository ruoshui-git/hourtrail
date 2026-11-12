<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Button from './Button.svelte';
	import Field from './Field.svelte';
	import TextInput from './TextInput.svelte';
	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel,
		cancelLabel = 'Cancel',
		danger = false,
		requireText,
		onconfirm,
	}: {
		open?: boolean;
		title: string;
		message: string;
		confirmLabel: string;
		cancelLabel?: string;
		danger?: boolean;
		requireText?: string;
		onconfirm: () => void | Promise<void>;
	} = $props();

	let typed = $state('');
	let busy = $state(false);
	const canConfirm = $derived(requireText === undefined || typed === requireText);

	// A reopened dialog must not remember the last attempt.
	$effect(() => {
		if (!open) typed = '';
	});

	async function confirm() {
		if (!canConfirm || busy) return;
		busy = true;
		try {
			await onconfirm();
			open = false;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="scrim" />
		<Dialog.Content class="dialog">
			<Dialog.Title class="ht-overlay-title">{title}</Dialog.Title>
			<Dialog.Description class="description">{message}</Dialog.Description>
			{#if requireText !== undefined}
				<Field label={`Type ${requireText} to confirm`}>
					{#snippet children(props)}
						<TextInput {...props} bind:value={typed} autocomplete="off" />
					{/snippet}
				</Field>
			{/if}
			<div class="actions">
				<Button variant="secondary" onclick={() => (open = false)}>{cancelLabel}</Button>
				<Button
					variant={danger ? 'danger' : 'primary'}
					disabled={!canConfirm}
					{busy}
					onclick={confirm}>{confirmLabel}</Button
				>
			</div>
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

	:global(.dialog) {
		position: fixed;
		z-index: var(--ht-z-sheet);
		inset: 0;
		margin: auto;
		display: grid;
		align-content: start;
		gap: var(--ht-space-4);
		width: min(var(--ht-dialog-max), 100% - 2 * var(--ht-gutter));
		min-width: min(var(--ht-dialog-min), 100% - 2 * var(--ht-gutter));
		height: fit-content;
		padding: var(--ht-space-5);
		border-radius: var(--ht-radius-sheet);
		border: var(--ht-hairline) solid var(--ht-overlay-border);
		background: var(--ht-surface);
		box-shadow: var(--ht-shadow-overlay);
		color: var(--ht-ink);
		animation: dialog-in var(--ht-duration-sheet) var(--ht-ease);
	}

	:global(.dialog[data-state='closed']) {
		animation: dialog-out var(--ht-duration-sheet) var(--ht-ease) forwards;
	}

	/* Opacity only, with the same duration, for reduced motion. */
	@media (prefers-reduced-motion: reduce) {
		:global(.dialog) {
			animation-name: fade-in;
		}

		:global(.dialog[data-state='closed']) {
			animation-name: fade-out;
		}
	}

	:global(.ht-overlay-title) {
		font: var(--ht-type-heading);
		color: var(--ht-ink);
		overflow-wrap: anywhere;
	}

	:global(.dialog .description) {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--ht-space-3);
	}

	.actions :global(button) {
		flex: 1 1 auto;
	}

	@media (width >= 768px) {
		.actions :global(button) {
			flex: none;
		}
	}

	@keyframes dialog-in {
		from {
			opacity: 0;
			translate: 0 var(--ht-space-2);
		}
	}

	@keyframes dialog-out {
		to {
			opacity: 0;
			translate: 0 var(--ht-space-2);
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
