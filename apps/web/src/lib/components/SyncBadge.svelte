<script lang="ts">
	import { CircleAlert, CloudCheck, CloudOff, CloudUpload, HardDrive } from '@lucide/svelte';

	let {
		state,
		pendingCount = 0,
		onclick,
	}: {
		state: 'local' | 'synced' | 'pending' | 'offline' | 'error';
		pendingCount?: number;
		onclick?: () => void;
	} = $props();

	function waiting(count: number): string {
		if (count === 1) return '1 change waiting';
		return count > 1 ? `${count} changes waiting` : 'Changes waiting';
	}

	const copy = $derived.by(() => {
		switch (state) {
			case 'local':
				return { icon: HardDrive, text: 'On this device only' };
			case 'synced':
				return { icon: CloudCheck, text: 'Backed up' };
			case 'pending':
				return { icon: CloudUpload, text: waiting(pendingCount) };
			case 'offline':
				return {
					icon: CloudOff,
					text: pendingCount > 0 ? `Offline. ${waiting(pendingCount)}` : 'Offline',
				};
			case 'error':
				return { icon: CircleAlert, text: 'Sync problem' };
		}
	});
	const Icon = $derived(copy.icon);
</script>

<button type="button" class="badge {state}" {onclick}>
	<span class="icon" aria-hidden="true"><Icon /></span>
	<span class="text">{copy.text}</span>
</button>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--ht-space-2);
		min-height: var(--ht-target);
		max-width: 100%;
		padding: var(--ht-space-2) var(--ht-space-3);
		border: var(--ht-hairline) solid transparent;
		border-radius: var(--ht-radius-control);
		background: transparent;
		color: var(--ht-ink-2);
		font: var(--ht-type-label);
		text-align: start;
	}

	.text {
		overflow-wrap: anywhere;
	}

	.icon {
		display: inline-flex;
		flex: none;
	}

	.icon :global(svg) {
		width: var(--ht-icon-sm);
		height: var(--ht-icon-sm);
		stroke-width: var(--ht-icon-stroke);
	}

	.error {
		color: var(--ht-danger);
	}

	@media (hover: hover) {
		.badge:hover {
			background: var(--ht-hover);
		}
	}

	.badge:active {
		background: var(--ht-pressed);
		transform: scale(var(--ht-press-scale));
	}
</style>
