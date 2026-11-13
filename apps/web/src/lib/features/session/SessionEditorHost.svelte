<script lang="ts">
	import { onMount } from 'svelte';
	import { sessionEditor } from './editor.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SessionEditor from './SessionEditor.svelte';
	import { expireStaleCaptures } from '$lib/features/location/capture';
	const request = $derived(sessionEditor.request);
	onMount(() => void expireStaleCaptures());
</script>

{#if request}
	<Sheet
		open={true}
		title={request.mode === 'new' ? 'Add session' : 'Edit session'}
		onclose={() => sessionEditor.close()}
	>
		{#key request}
			<SessionEditor {request} onclose={() => sessionEditor.close()} />
		{/key}
	</Sheet>
{/if}
