<script lang="ts">
	import { page } from '$app/state';
	import { Sidebar, TabBar } from '$lib/components';
	import type { Destination } from '$lib/components/nav';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let current = $derived(
		(page.url.pathname === '/' ? 'home' : page.url.pathname.slice(1)) as Destination,
	);
</script>

<div class="frame">
	<aside class="desktop-nav"><Sidebar {current} /></aside>
	<main>{@render children()}</main>
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
