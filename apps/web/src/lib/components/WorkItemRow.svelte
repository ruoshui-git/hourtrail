<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	import { Ellipsis, Pin, Play } from '@lucide/svelte';
	import Blaze from './Blaze.svelte';
	import IconButton from './IconButton.svelte';

	/** Press and hold for this long to open details instead of starting. */
	const LONG_PRESS_MS = 500;

	let {
		name,
		typeColor,
		typeName,
		projectName,
		pinned = false,
		pending = false,
		disabled = false,
		onstart,
		onopen,
	}: {
		name: string;
		typeColor: BlazeKey;
		typeName: string;
		projectName?: string;
		pinned?: boolean;
		pending?: boolean;
		disabled?: boolean;
		onstart: () => void;
		onopen: () => void;
	} = $props();

	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	// Set when the long press has already opened details, so the click that ends the same
	// gesture does not also start the item.
	let longPressed = false;

	function cancelPress() {
		clearTimeout(pressTimer);
		pressTimer = undefined;
	}

	function beginPress() {
		longPressed = false;
		cancelPress();
		pressTimer = setTimeout(() => {
			pressTimer = undefined;
			longPressed = true;
			onopen();
		}, LONG_PRESS_MS);
	}

	function tap() {
		if (longPressed) {
			longPressed = false;
			return;
		}
		onstart();
	}

	const label = $derived(projectName ? `${typeName}, ${projectName}` : typeName);
</script>

<div class="row">
	<button
		type="button"
		class="body"
		{disabled}
		onpointerdown={beginPress}
		onpointerup={cancelPress}
		onpointerleave={cancelPress}
		onpointercancel={cancelPress}
		oncontextmenu={(event) => event.preventDefault()}
		onclick={tap}
	>
		<span class="blaze"><Blaze color={typeColor} /></span>
		<span class="text">
			<span class="name">
				{name}
				{#if pinned}<Pin class="pin" role="img" aria-label="Pinned" />{/if}
			</span>
			<span class="label">{label}</span>
		</span>
		{#if pending}
			<span class="pending" role="img" aria-label="Not backed up yet"></span>
		{/if}
	</button>
	<IconButton label={`Start ${name}`} icon={Play} {disabled} onclick={() => onstart()} />
	<IconButton label={`Details for ${name}`} icon={Ellipsis} onclick={() => onopen()} />
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--ht-space-1);
		min-height: var(--ht-target);
		min-width: 0;
	}

	.body {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--ht-space-3);
		min-width: 0;
		min-height: var(--ht-target);
		padding: var(--ht-space-2) var(--ht-space-3);
		border: 0;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink);
		text-align: start;
		-webkit-touch-callout: none;
		user-select: none;
	}

	.body:disabled {
		color: var(--ht-ink-3);
		cursor: default;
	}

	@media (hover: hover) {
		.body:hover:enabled {
			background: var(--ht-hover);
		}
	}

	.body:active:enabled {
		background: var(--ht-pressed);
	}

	.blaze {
		display: inline-flex;
		flex: none;
	}

	.text {
		display: grid;
		gap: var(--ht-space-1);
		min-width: 0;
	}

	.name {
		display: flex;
		align-items: center;
		gap: var(--ht-space-2);
		font: var(--ht-type-body-strong);
		overflow-wrap: anywhere;
	}

	.name :global(.pin) {
		flex: none;
		width: var(--ht-icon-sm);
		height: var(--ht-icon-sm);
		color: var(--ht-ink-2);
	}

	.label {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.pending {
		flex: none;
		margin-inline-start: auto;
		width: var(--ht-space-2);
		height: var(--ht-space-2);
		border: var(--ht-hairline) solid var(--ht-ink-2);
		border-radius: var(--ht-radius-chip);
	}
</style>
