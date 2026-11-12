<script lang="ts">
	import { onMount } from 'svelte';
	import { Archive, Copy, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { Button, Field, TextArea, TextInput } from '$lib/components';
	import { ConfirmDialog, Menu, Sheet, showToast } from '$lib/components/index.overlays';

	// ?open=<id> opens one overlay on load, for the screenshot routes.
	let sheetOpen = $state(false);
	let confirmOpen = $state(false);
	let dangerOpen = $state(false);
	let typedOpen = $state(false);
	let menuOpen = $state(false);
	let note = $state('修复洗手台\n检查了第1寺院的水龙头，并记录了工作。');

	onMount(() => {
		const id = new URLSearchParams(window.location.search).get('open');
		if (id === 'sheet') sheetOpen = true;
		if (id === 'confirm') confirmOpen = true;
		if (id === 'confirm-danger') dangerOpen = true;
		if (id === 'confirm-typed') typedOpen = true;
		if (id === 'menu') menuOpen = true;
	});

	const items = [
		{ label: 'Edit session', icon: Pencil, onselect: () => (sheetOpen = true) },
		{
			label: 'Duplicate session',
			icon: Copy,
			onselect: () => {
				showToast({ message: 'Session copied.' });
			},
		},
		{ label: 'Move to another day', icon: Archive, disabled: true, onselect: () => {} },
		{ label: 'Delete session', icon: Trash2, danger: true, onselect: () => (dangerOpen = true) },
	];
</script>

<section>
	<h2>Overlays</h2>
	<p class="caption">
		Sheet, confirmation dialogs and menu. Each opens from its trigger; the shot routes open them
		with ?open=.
	</p>
	<div class="examples">
		<Button variant="secondary" icon={Pencil} onclick={() => (sheetOpen = true)}
			>Edit session</Button
		>
		<Button variant="secondary" onclick={() => (confirmOpen = true)}>Switch to Volunteer</Button>
		<Button variant="danger" icon={Trash2} onclick={() => (dangerOpen = true)}
			>Delete session</Button
		>
		<Button variant="danger" onclick={() => (typedOpen = true)}>Replace everything</Button>
		<Menu label="More actions" {items} bind:open={menuOpen} />
	</div>

	<Sheet
		bind:open={sheetOpen}
		title="Edit session"
		description="Change the note for this session."
		onclose={() => showToast({ message: 'Changes discarded.' })}
	>
		<Field label="Work item">
			{#snippet children(props)}<TextInput
					{...props}
					value="库存管理系统开发"
					autocomplete="off"
				/>{/snippet}
		</Field>
		<Field label="Note" hint="Grows as you write.">
			{#snippet children(props)}<TextArea {...props} bind:value={note} />{/snippet}
		</Field>
		{#snippet footer()}
			<Button variant="quiet" onclick={() => (sheetOpen = false)}>Cancel</Button>
			<Button icon={Plus} onclick={() => (sheetOpen = false)}>Save changes</Button>
		{/snippet}
	</Sheet>

	<ConfirmDialog
		bind:open={confirmOpen}
		title="Switch to Volunteer?"
		message="The running session stops at 4:02 AM and a new one starts."
		confirmLabel="Switch"
		onconfirm={() => {
			showToast({ message: 'Switched to Volunteer.' });
		}}
	/>

	<ConfirmDialog
		bind:open={dangerOpen}
		title="Delete this session?"
		message="The session and its note are removed from every device. This cannot be undone."
		confirmLabel="Delete session"
		danger
		onconfirm={() => {
			showToast({ message: 'Session deleted.' });
		}}
	/>

	<ConfirmDialog
		bind:open={typedOpen}
		title="Replace everything?"
		message="Everything on this phone is replaced with the backup. Changes that have not uploaded are lost."
		confirmLabel="Replace everything"
		requireText="Replace everything"
		danger
		onconfirm={() => {
			showToast({ message: 'Backup restored.' });
		}}
	/>
</section>
