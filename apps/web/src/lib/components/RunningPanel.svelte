<script lang="ts">
	import type { BlazeKey } from '@hourtrail/core';
	import Button from './Button.svelte';
	import Field from './Field.svelte';
	import TextInput from './TextInput.svelte';
	import Timer from './Timer.svelte';
	import TypeTag from './TypeTag.svelte';
	import { formatClock } from './trail';

	let {
		typeName,
		typeColor,
		workItemName,
		startAt,
		placeName,
		now,
		busy = false,
		onstop,
		onswitch,
		onname,
		ontypeclick,
		onnameclick,
	}: {
		typeName: string;
		typeColor: BlazeKey;
		workItemName: string | null;
		startAt: number;
		placeName?: string;
		now?: number;
		busy?: boolean;
		onstop: () => void;
		onswitch: () => void;
		onname?: (name: string) => void;
		ontypeclick?: () => void;
		onnameclick?: () => void;
	} = $props();

	// Ticks once a second from the device clock unless the caller pins `now`. Elapsed time is
	// always recomputed from startAt, so a throttled or sleeping timer catches up on wake.
	let clock = $state(Date.now());
	const current = $derived(now ?? clock);

	$effect(() => {
		if (now !== undefined) return;
		const refresh = () => (clock = Date.now());
		refresh();
		const id = setInterval(refresh, 1000);
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('pageshow', refresh);
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('pageshow', refresh);
		};
	});

	let draft = $state('');

	function commitName() {
		const name = draft.trim();
		if (!name) return;
		draft = '';
		onname?.(name);
	}

	const startLine = $derived(
		`Started ${formatClock(startAt)}${placeName ? ` at ${placeName}` : ''}`,
	);
</script>

<section class="panel" style:--blaze={`var(--ht-blaze-${typeColor})`} aria-label="Running session">
	<span class="paint" aria-hidden="true"></span>
	<div class="head">
		{#if ontypeclick}
			<button type="button" class="type" onclick={ontypeclick}
				><TypeTag name={typeName} color={typeColor} /></button
			>
		{:else}
			<TypeTag name={typeName} color={typeColor} />
		{/if}
	</div>

	{#if !workItemName}
		<form
			class="name-form"
			onsubmit={(event) => {
				event.preventDefault();
				commitName();
			}}
			onfocusout={commitName}
		>
			<Field label="Name this session">
				{#snippet children({ id, describedBy, invalid })}
					<TextInput bind:value={draft} {id} {describedBy} {invalid} />
				{/snippet}
			</Field>
		</form>
	{:else if onnameclick}
		<button type="button" class="name" onclick={onnameclick}>{workItemName}</button>
	{:else}
		<p class="name">{workItemName}</p>
	{/if}

	<div class="timer"><Timer ms={current - startAt} /></div>
	<p class="started">{startLine}</p>

	<div class="actions">
		<Button variant="primary" size="lg" wide {busy} onclick={onstop}>Stop</Button>
		<Button variant="secondary" size="lg" {busy} onclick={onswitch}>Switch</Button>
	</div>
</section>

<style>
	.panel {
		position: relative;
		display: grid;
		gap: var(--ht-space-3);
		padding: var(--ht-space-5) var(--ht-gutter);
		border-radius: var(--ht-radius-panel);
		background: color-mix(in srgb, var(--blaze) var(--ht-wash-mix), var(--ht-surface));
		color: var(--ht-ink);
		overflow: hidden;
		animation: wash var(--ht-duration-start) var(--ht-ease) both;
	}

	/* The start-of-session blaze paints in from the top edge. */
	.paint {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		width: var(--ht-blaze-lg-w);
		border-radius: var(--ht-radius-blaze);
		background: var(--blaze);
		transform-origin: top;
		animation: paint var(--ht-duration-start) var(--ht-ease) both;
	}

	.head {
		display: flex;
		min-width: 0;
	}

	.type {
		display: inline-flex;
		min-width: 0;
		min-height: var(--ht-target);
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: start;
	}

	.name {
		margin: 0;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ht-ink);
		font: var(--ht-type-heading);
		text-align: start;
		overflow-wrap: anywhere;
	}

	button.name {
		cursor: pointer;
	}

	.name-form {
		min-width: 0;
	}

	.timer {
		color: var(--ht-ink);
		font-variant-numeric: tabular-nums;
	}

	.started {
		font: var(--ht-type-label);
		color: var(--ht-ink-2);
		overflow-wrap: anywhere;
	}

	.actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--ht-space-3);
		align-items: center;
	}

	@keyframes paint {
		from {
			transform: scaleY(0);
		}
	}

	@keyframes wash {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.paint {
			animation: wash var(--ht-duration-start) var(--ht-ease) both;
		}
	}
</style>
