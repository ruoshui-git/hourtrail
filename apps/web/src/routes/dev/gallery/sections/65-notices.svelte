<script lang="ts">
	import { onMount } from 'svelte';
	import { EmptyState, Banner, ToastRegion, showToast } from '$lib/components/index.overlays';
	import { Button } from '$lib/components';

	// The two stacked examples stay on screen for the shots; live toasts time out after six seconds.
	const STAY_MS = 86_400_000;
	onMount(() => {
		showToast({
			message: 'Session deleted.',
			durationMs: STAY_MS,
			undo: () => showToast({ message: 'Session restored.' }),
		});
		showToast({
			message: 'Saved on this phone. It will upload when you’re back online.',
			durationMs: STAY_MS,
		});
	});

	type Banner = {
		tone: 'neutral' | 'caution' | 'danger';
		message: string;
		action?: { label: string; onclick: () => void };
	};
	const banners: Banner[] = [
		{ tone: 'neutral', message: 'Reminders are off on this device.' },
		{
			tone: 'neutral',
			message: 'Reminders are off on this device.',
			action: { label: 'Turn on', onclick: () => showToast({ message: 'Reminders on.' }) },
		},
		{ tone: 'caution', message: 'Two sessions overlap on 12 Nov. Check the times.' },
		{
			tone: 'caution',
			message: 'Couldn’t reach the cloud. Your changes are saved on this phone.',
			action: { label: 'Try again', onclick: () => showToast({ message: 'Still offline.' }) },
		},
		{ tone: 'danger', message: 'Backup failed. Nothing on this phone was changed.' },
		{
			tone: 'danger',
			message: 'Backup failed. Nothing on this phone was changed.',
			action: { label: 'Try again', onclick: () => showToast({ message: 'Backup started.' }) },
		},
	];
</script>

<section>
	<h2>Notices</h2>
	<div class="stack">
		<h3>Banners</h3>
		{#each banners as banner, index (index)}
			<Banner tone={banner.tone} message={banner.message} action={banner.action} />
		{/each}
	</div>
	<div class="sample">
		<h3>Empty state</h3>
		<EmptyState
			message="No sessions on this day."
			actionLabel="Add session"
			onaction={() => showToast({ message: 'Session added.' })}
		/>
	</div>
	<div class="sample">
		<h3>Toasts</h3>
		<div class="examples">
			<Button variant="secondary" onclick={() => showToast({ message: 'Session stopped.' })}
				>Show toast</Button
			>
		</div>
		<div class="toast-demo">
			<ToastRegion />
		</div>
	</div>
</section>

<style>
	.toast-demo :global(.region) {
		position: static;
		inset: auto;
		display: grid;
		justify-items: start;
		pointer-events: auto;
	}
</style>
