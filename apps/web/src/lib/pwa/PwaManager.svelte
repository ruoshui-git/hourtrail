<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Sheet } from '$lib/components';
	import { showToast } from '$lib/components/toasts.svelte';
	import { applyUpdate } from './pwa.svelte';
	import { dismissInstallHint, installHintDismissed, shouldShowInstallHint } from './install';

	let installOpen = $state(false);
	onMount(() => {
		if (
			shouldShowInstallHint({
				userAgent: navigator.userAgent,
				maxTouchPoints: navigator.maxTouchPoints,
				standalone: 'standalone' in navigator && navigator.standalone === true,
				displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
			}) &&
			!installHintDismissed()
		)
			installOpen = true;

		if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
		let registration: ServiceWorkerRegistration;
		let reloadOnChange = false;
		const onControllerChange = () => {
			if (reloadOnChange) window.location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
		const offerUpdate = (worker: ServiceWorker) => {
			applyUpdate();
			showToast({
				message: 'Update ready.',
				durationMs: 2_147_483_647,
				action: {
					label: 'Reload',
					run: () => {
						reloadOnChange = true;
						worker.postMessage({ type: 'SKIP_WAITING' });
					},
				},
			});
		};
		navigator.serviceWorker
			.register('/service-worker.js')
			.then((value) => {
				registration = value;
				if (registration.waiting) offerUpdate(registration.waiting);
				registration.addEventListener('updatefound', () => {
					const worker = registration.installing;
					worker?.addEventListener('statechange', () => {
						if (worker.state === 'installed' && navigator.serviceWorker.controller)
							offerUpdate(worker);
					});
				});
			})
			.catch(() => {});
		return () =>
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
	});
</script>

<Sheet
	bind:open={installOpen}
	title="Add Hourtrail to your Home Screen"
	onclose={() => {
		installOpen = false;
	}}
>
	<ol>
		<li>Tap Share.</li>
		<li>Tap Add to Home Screen.</li>
	</ol>
	<div class="actions">
		<Button
			variant="quiet"
			onclick={() => {
				dismissInstallHint();
				installOpen = false;
			}}>Not now</Button
		>
	</div>
</Sheet>

<style>
	ol {
		display: grid;
		gap: var(--ht-space-3);
		padding-inline-start: var(--ht-space-5);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
