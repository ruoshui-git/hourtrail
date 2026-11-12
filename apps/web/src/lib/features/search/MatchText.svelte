<script lang="ts">
	let { text, query }: { text: string; query: string } = $props();
	const parts = $derived.by(() => {
		const needle = query.trim();
		if (!needle) return [{ value: text, match: false }];
		const lower = text.toLocaleLowerCase();
		const folded = needle.toLocaleLowerCase();
		const result: { value: string; match: boolean }[] = [];
		let cursor = 0;
		let found = lower.indexOf(folded, cursor);
		while (found >= 0) {
			if (found > cursor) result.push({ value: text.slice(cursor, found), match: false });
			result.push({ value: text.slice(found, found + needle.length), match: true });
			cursor = found + needle.length;
			found = lower.indexOf(folded, cursor);
		}
		if (cursor < text.length) result.push({ value: text.slice(cursor), match: false });
		return result;
	});
</script>

{#each parts as part, index (index)}{#if part.match}<mark>{part.value}</mark
		>{:else}{part.value}{/if}{/each}

<style>
	mark {
		background: transparent;
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--ht-ink);
		text-decoration-thickness: var(--ht-hairline);
		text-underline-offset: var(--ht-space-1);
	}
</style>
