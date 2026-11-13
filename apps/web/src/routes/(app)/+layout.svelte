<script lang="ts">
	import { page } from '$app/state';
	import { Sidebar, TabBar } from '$lib/components';
	import type { Destination } from '$lib/components/nav';
	import type { Snippet } from 'svelte';
	import SessionEditorHost from '$lib/features/session/SessionEditorHost.svelte';
	import { prepareLocalData } from '$lib/db/app';
	import { auth } from '$lib/features/cloud/auth.svelte';
	import { sync } from '$lib/features/sync/engine.svelte';
	import SyncControl from '$lib/features/sync/ui/SyncControl.svelte';
	import { db } from '$lib/db/app';
	import { setClockOffset } from '$lib/features/clock/clock';

	let { children }: { children: Snippet } = $props();

	// Seed default types and the reporting zone once, outside any live query.
	$effect(() => {
		void prepareLocalData();
		void db.local.get('clock_offset_ms').then((row) => setClockOffset(row?.value));
	});
	$effect(() => {
		if (
			auth.status === 'unknown' &&
			page.url.pathname !== '/link' &&
			page.url.pathname !== '/settings/cloud'
		)
			void auth.hydrate();
		else if (auth.status === 'signed-in') sync.start();
		else sync.stop();
	});
	// The first path segment names the destination, so /items/<id> still marks Items.
	let current = $derived(
		(page.url.pathname === '/' ? 'home' : page.url.pathname.split('/')[1]) as Destination,
	);
</script>

<div class="frame">
	<aside class="desktop-nav">
		<Sidebar {current}>
			{#snippet footer()}<SyncControl />{/snippet}
		</Sidebar>
	</aside>
	<main>{@render children()}</main>
	<SessionEditorHost />
	<div class="mobile-nav"><TabBar {current} /></div>
</div>

<style>
	.frame {
		min-height: 100dvh;
	}

	main {
		min-width: 0;
		min-height: 100dvh;
		padding: calc(var(--ht-gutter) + env(safe-area-inset-top)) var(--ht-gutter)
			calc(var(--ht-target) + var(--ht-space-5) + var(--ht-gutter) + env(safe-area-inset-bottom));
	}

	.desktop-nav {
		display: none;
	}

	.mobile-nav {
		position: fixed;
		inset: auto 0 0;
		z-index: var(--ht-z-nav);
	}

	@media (width >= 1024px) {
		.frame {
			display: grid;
			grid-template-columns: var(--ht-sidebar-width) minmax(0, 1fr);
		}

		.desktop-nav {
			display: block;
		}

		.mobile-nav {
			display: none;
		}

		main {
			padding: var(--ht-gutter);
		}
	}
</style>
