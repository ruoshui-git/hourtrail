<script lang="ts">
	import { Sidebar, SyncBadge, TabBar } from '$lib/components/index.domain';
	const noop = () => {};
	const states = [
		{ state: 'local' },
		{ state: 'synced' },
		{ state: 'pending', pendingCount: 1 },
		{ state: 'pending', pendingCount: 3 },
		{ state: 'offline', pendingCount: 0 },
		{ state: 'offline', pendingCount: 3 },
		{ state: 'error' },
	] as const;
</script>

<section>
	<h2>Navigation and sync</h2>
	<div class="stack">
		<p class="caption">Tab bar on phones, shown with each destination selected</p>
		<TabBar current="home" />
		<TabBar current="history" />
		<TabBar current={null} />
	</div>
	<div class="stack">
		<p class="caption">Sidebar from 1024 px, with the sync badge in its footer</p>
		<div class="frame">
			<Sidebar current="history">
				{#snippet footer()}<SyncBadge state="synced" onclick={noop} />{/snippet}
			</Sidebar>
		</div>
	</div>
	<div class="stack">
		<p class="caption">Sync badge in every state</p>
		<div class="examples">
			{#each states as badge, index (index)}<SyncBadge {...badge} onclick={noop} />{/each}
		</div>
	</div>
</section>

<style>
	.frame {
		display: flex;
		min-width: 0;
		border: var(--ht-hairline) solid var(--ht-line);
		border-radius: var(--ht-radius-control);
		overflow: hidden;
	}
</style>
