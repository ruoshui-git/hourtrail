<script lang="ts">
	import { onMount } from 'svelte';
	import { openNewSession, openSessionEditor } from '$lib/features/session/editor.svelte';

	onMount(() => {
		const query = new URLSearchParams(window.location.search);
		const id = query.get('id');
		if (id) {
			openSessionEditor(id);
			return;
		}
		if (query.get('new') !== '1') {
			return;
		}
		const timestamp = (key: string) => {
			const value = query.get(key);
			if (value === null) return undefined;
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		};
		openNewSession({
			start_at: timestamp('start'),
			end_at: timestamp('end'),
			work_item_id: query.get('work_item_id'),
		});
	});
</script>

<svelte:head><title>Session editor · Hourtrail</title></svelte:head>
