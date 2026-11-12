<script lang="ts">
	import { Timer } from '$lib/components';
</script>

<section>
	<h2>Timer</h2>
	<p class="caption">Fixed cells keep elapsed time steady.</p>
	<div class="stack">
		{#each [0, 59000, 3600000, 8047000, 36000000] as ms (ms)}<div class="sample">
				<Timer {ms} /><Timer {ms} size="figure" />
			</div>{/each}
	</div>
</section>
