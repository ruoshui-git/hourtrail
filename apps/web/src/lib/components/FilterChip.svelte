<script lang="ts">
	let {
		selected = $bindable(false),
		label,
		disabled = false,
	}: { selected?: boolean; label: string; disabled?: boolean } = $props();
</script>

<button type="button" aria-pressed={selected} {disabled} onclick={() => (selected = !selected)}
	>{label}</button
>

<style>
	button {
		min-width: var(--ht-target);
		min-height: var(--ht-target);
		max-width: 100%;
		padding: var(--ht-space-2) var(--ht-space-4);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-chip);
		background: transparent;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
		overflow-wrap: anywhere;
		transition:
			background var(--ht-duration-press) var(--ht-ease),
			transform var(--ht-duration-press) var(--ht-ease);
	}

	button[aria-pressed='true'] {
		background: var(--ht-ink);
		color: var(--ht-paper);
		border-color: var(--ht-ink);
	}

	button:disabled {
		color: var(--ht-ink-3);
		border-color: var(--ht-line);
		cursor: default;
	}

	button[aria-pressed='true']:disabled {
		background: var(--ht-sunken);
	}

	@media (hover: hover) {
		button:hover:enabled {
			background: var(--ht-hover);
		}

		button[aria-pressed='true']:hover:enabled {
			background: var(--ht-ink-hover);
		}
	}

	button:active:enabled {
		transform: scale(var(--ht-press-scale));
		background: var(--ht-pressed);
	}

	button[aria-pressed='true']:active:enabled {
		background: var(--ht-ink-hover);
	}
</style>
