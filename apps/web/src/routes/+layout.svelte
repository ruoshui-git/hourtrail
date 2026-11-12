<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import type { Snippet } from 'svelte';
	import { ToastRegion } from '$lib/components';
	import PwaManager from '$lib/pwa/PwaManager.svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<ToastRegion />
<PwaManager />
