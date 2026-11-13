<script lang="ts">
	import { Switch } from 'bits-ui';
	const uid = $props.id();
	let {
		checked = $bindable(false),
		label,
		hint,
		disabled = false,
		onchange,
	}: {
		checked?: boolean;
		label: string;
		hint?: string;
		disabled?: boolean;
		/** Called when the user toggles it (for writes that may be refused, e.g. a permission). */
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<Switch.Root
	bind:checked
	onCheckedChange={(value) => onchange?.(value)}
	{disabled}
	class="ht-switch-row"
	aria-labelledby={`${uid}-label`}
	aria-describedby={hint ? `${uid}-hint` : undefined}
>
	<span class="text"
		><span id={`${uid}-label`}>{label}</span>{#if hint}<span class="hint" id={`${uid}-hint`}
				>{hint}</span
			>{/if}</span
	>
	<span class="track" aria-hidden="true"><Switch.Thumb class="ht-switch-knob" /></span>
</Switch.Root>

<style>
	:global(.ht-switch-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ht-space-4);
		width: 100%;
		min-height: var(--ht-target);
		padding: var(--ht-space-2) 0;
		border: 0;
		background: transparent;
		text-align: left;
		color: var(--ht-ink);
		font: var(--ht-type-body);
		transition:
			background var(--ht-duration-press) var(--ht-ease),
			transform var(--ht-duration-press) var(--ht-ease);
	}

	.text {
		display: grid;
		gap: var(--ht-space-1);
	}

	.hint {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
	}

	.track {
		display: flex;
		align-items: center;
		flex: none;
		width: var(--ht-target);
		height: var(--ht-space-5);
		padding: var(--ht-hairline);
		border: var(--ht-hairline) solid var(--ht-line-strong);
		border-radius: var(--ht-radius-chip);
		background: var(--ht-sunken);
	}

	:global(.ht-switch-knob) {
		display: block;
		width: var(--ht-icon);
		height: var(--ht-icon);
		border-radius: var(--ht-radius-chip);
		background: var(--ht-surface);
	}

	:global(.ht-switch-row[data-state='checked']) .track {
		justify-content: end;
		background: var(--ht-ink);
		border-color: var(--ht-ink);
	}

	:global(.ht-switch-row[data-state='checked'] .ht-switch-knob) {
		background: var(--ht-paper);
	}

	:global(.ht-switch-row:disabled),
	:global(.ht-switch-row:disabled) .hint {
		color: var(--ht-ink-3);
		cursor: default;
	}

	:global(.ht-switch-row:disabled) .track {
		border-color: var(--ht-line);
	}

	:global(.ht-switch-row:disabled .ht-switch-knob) {
		background: var(--ht-ink-3);
	}

	@media (hover: hover) {
		:global(.ht-switch-row:hover:enabled) {
			background: var(--ht-hover);
		}
	}

	:global(.ht-switch-row:active:enabled) {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}
</style>
