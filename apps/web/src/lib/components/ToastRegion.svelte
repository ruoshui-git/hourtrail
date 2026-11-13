<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { dismissToast, holdToast, toasts } from './toasts.svelte';

	// Undo must run once even if the button is clicked twice before the toast leaves.
	const undone = new SvelteSet<string>();

	function undo(toast: { id: string; undo?: () => void }) {
		if (undone.has(toast.id)) return;
		undone.add(toast.id);
		toast.undo?.();
		dismissToast(toast.id);
	}

	function run(toast: { id: string; action?: { run: () => void } }) {
		toast.action?.run();
		dismissToast(toast.id);
	}
</script>

<div class="region" aria-live="polite" aria-atomic="false">
	{#each toasts.items as toast (toast.id)}
		<div
			class="toast"
			role="group"
			onpointerenter={() => holdToast(toast.id, 'hover', true)}
			onpointerleave={() => holdToast(toast.id, 'hover', false)}
			onfocusin={() => holdToast(toast.id, 'focus', true)}
			onfocusout={() => holdToast(toast.id, 'focus', false)}
		>
			<p>{toast.message}</p>
			{#if toast.undo}
				<button type="button" class="quiet" onclick={() => undo(toast)}>Undo</button>
			{/if}
			{#if toast.action}
				<button type="button" class="quiet" onclick={() => run(toast)}>{toast.action.label}</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.region {
		position: fixed;
		z-index: var(--ht-z-toast);
		inset-inline: var(--ht-gutter);
		bottom: calc(env(safe-area-inset-bottom) + var(--ht-button-lg) + var(--ht-space-4));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--ht-space-2);
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--ht-space-3);
		width: 100%;
		max-width: var(--ht-dialog-min);
		min-width: 0;
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-4);
		border: var(--ht-hairline) solid var(--ht-overlay-border);
		border-radius: var(--ht-radius-control);
		background: var(--ht-surface);
		box-shadow: var(--ht-shadow-overlay);
		font: var(--ht-type-body);
		color: var(--ht-ink);
		pointer-events: auto;
	}

	.toast p {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.quiet {
		flex: none;
		min-height: var(--ht-target);
		padding-inline: var(--ht-space-3);
		border: var(--ht-hairline) solid transparent;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-body-strong);
	}

	@media (hover: hover) {
		.quiet:hover {
			background: var(--ht-hover);
		}
	}

	.quiet:active {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}

	@media (width >= 1024px) {
		.region {
			inset-inline: auto var(--ht-gutter);
			bottom: var(--ht-space-5);
			align-items: flex-end;
		}
	}
</style>
