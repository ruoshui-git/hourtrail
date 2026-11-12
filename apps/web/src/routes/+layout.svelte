<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import type { Snippet } from 'svelte';
	import { ToastRegion } from '$lib/components';
	import PwaManager from '$lib/pwa/PwaManager.svelte';
	import { onMount } from 'svelte';
	import { applyTheme } from '$lib/theme';
	import { getTheme } from '$lib/features/settings/local';

	let { children }: { children: Snippet } = $props();
	onMount(async () => applyTheme(await getTheme()));
</script>

{@render children()}
<ToastRegion />
<PwaManager />
