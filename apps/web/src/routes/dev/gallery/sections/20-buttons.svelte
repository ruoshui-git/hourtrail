<script lang="ts">
	import { Plus, Download } from '@lucide/svelte';
	import { Button, IconButton } from '$lib/components';
	const variants = ['primary', 'secondary', 'quiet', 'danger'] as const;
</script>

<section>
	<h2>Buttons</h2>
	<div class="stack"><Button size="lg" wide>Start</Button><Button size="lg" wide>Stop</Button></div>
	{#each variants as variant (variant)}{@const label =
			variant === 'danger' ? 'Delete session' : 'Save changes'}
		<div class="sample">
			<h3>{variant.charAt(0).toUpperCase() + variant.slice(1)}</h3>
			<div class="examples">
				<Button {variant} size="lg">{label}</Button><Button {variant}>{label}</Button><Button
					{variant}
					size="sm">{label}</Button
				>
			</div>
			<div class="examples">
				<Button {variant} disabled>{label}</Button><Button {variant} busy>{label}</Button>
			</div>
			<p class="caption">Large, medium, small; disabled and busy</p>
		</div>{/each}
	<div class="examples">
		<Button icon={Plus}>Add session</Button><Button variant="secondary" icon={Download}
			>Download backup</Button
		><Button type="submit" variant="quiet">Save changes</Button>
	</div>
	<Button variant="secondary" wide>Quarterly volunteer coordination and event preparation</Button>
	<div class="sample">
		<h3>Icon buttons</h3>
		<div class="examples">
			{#each ['quiet', 'secondary'] as variant (variant)}<IconButton
					label="Add session"
					icon={Plus}
					variant={variant as 'quiet' | 'secondary'}
				/><IconButton
					label="Add session unavailable"
					icon={Plus}
					variant={variant as 'quiet' | 'secondary'}
					disabled
				/>{/each}
		</div>
	</div>
</section>
