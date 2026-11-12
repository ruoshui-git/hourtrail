<script lang="ts">
	// Dev-only: reset the local database to a named scenario, e.g. /dev/seed?scenario=running.
	import { page } from '$app/state';
	import { db, repo } from '$lib/db/app';
	import { seed, SEED_SCENARIOS, type SeedScenario } from '$lib/dev/seed';

	let status = $state('Seeding…');
	$effect(() => {
		const requested = page.url.searchParams.get('scenario') ?? 'idle';
		if (!(SEED_SCENARIOS as readonly string[]).includes(requested)) {
			status = `Unknown scenario: ${requested}`;
			return;
		}
		seed(db, repo, requested as SeedScenario).then(
			() => (status = `Seeded ${requested}`),
			(error: unknown) => (status = `Seeding failed: ${String(error)}`),
		);
	});
</script>

<main>
	<h1>Seed data</h1>
	<p data-seed-status>{status}</p>
</main>
