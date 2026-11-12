<script lang="ts">
	import { BLAZE_KEYS } from '@hourtrail/core';
	import { Blaze, TypeTag } from '$lib/components';
</script>

<section>
	<h2>Blazes and type tags</h2>
	<p class="caption">All activity colours, in small, medium and large. Filled and archived.</p>
	<div class="columns">
		{#each BLAZE_KEYS as color (color)}<div class="sample">
				<TypeTag name={color.charAt(0).toUpperCase() + color.slice(1)} {color} />
				<div class="examples">
					{#each ['sm', 'md', 'lg'] as size (size)}<Blaze
							{color}
							size={size as 'sm' | 'md' | 'lg'}
						/><Blaze {color} size={size as 'sm' | 'md' | 'lg'} archived />{/each}
				</div>
			</div>{/each}
	</div>
	<div class="stack">
		<TypeTag name="Work" color="lake" size="sm" /><TypeTag name="Volunteer" color="fern" /><TypeTag
			name="Personal"
			color="heather"
			size="sm"
			archived
		/><TypeTag name="Building Maintenance" color="saffron" archived /><TypeTag
			name="库存管理系统开发"
			color="lake"
		/><TypeTag name="Quarterly volunteer coordination and event preparation" color="fern" />
	</div>
</section>
