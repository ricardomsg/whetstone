<script lang="ts">
	// Sparkline: one series, no axes; the latest value is printed beside it by the caller.
	let { values, width = 110, height = 30 }: { values: (number | null)[]; width?: number; height?: number } = $props();
	const pts = $derived(values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[]);
	const d = $derived.by(() => {
		if (pts.length < 2) return '';
		const n = values.length - 1 || 1;
		return pts.map((p, k) => `${k ? 'L' : 'M'}${((p.i / n) * (width - 4) + 2).toFixed(1)},${(height - 3 - (p.v / 100) * (height - 6)).toFixed(1)}`).join('');
	});
	const last = $derived(pts.at(-1));
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	{#if d}<path {d} fill="none" stroke="var(--series-1, #3987e5)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />{/if}
	{#if last}<circle cx={(last.i / (values.length - 1 || 1)) * (width - 4) + 2} cy={height - 3 - (last.v / 100) * (height - 6)} r="3" fill="var(--series-1, #3987e5)" />{/if}
</svg>
