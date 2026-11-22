<script lang="ts">
	// Small line chart: one y axis, ≤ 2 series, 2px lines, 8px markers where points are sparse,
	// crosshair tooltip listing every series, legend + end labels for 2 series, table view below.
	interface Series { name: string; values: (number | null)[] }
	let { labels, series, yMax = 100, yMin = 0, unit = '', title = '' }: { labels: string[]; series: Series[]; yMax?: number; yMin?: number; unit?: string; title?: string } = $props();
	const W = 420, H = 170, L = 36, R = 64, T = 10, B = 26;
	const colors = ['var(--series-1)', 'var(--series-2)'];
	const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
	const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
	function path(vals: (number | null)[]) {
		let d = '', pen = false;
		vals.forEach((v, i) => {
			if (v == null) { pen = false; return; }
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
			pen = true;
		});
		return d;
	}
	const ticks = $derived([yMin, (yMin + yMax) / 2, yMax]);
	const sparse = $derived(series.map((s) => s.values.filter((v) => v != null).length <= 20));
	let hover = $state<number | null>(null);
	let box: HTMLDivElement;
	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * W;
		let best = 0, bd = Infinity;
		labels.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
		hover = best;
	}
	const lastIdx = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1; };
	const fmt = (v: number | null) => (v == null ? '—' : `${Math.round(v * 10) / 10}${unit}`);
	const every = $derived(Math.max(1, Math.ceil(labels.length / 5)));
	// Drop the second end label when it would sit on top of the first; the legend still names both.
	const labelClash = $derived.by(() => {
		if (series.length < 2) return false;
		const [a, b] = series.map((s) => { const i = lastIdx(s.values); return i < 0 ? null : y(s.values[i]!); });
		return a != null && b != null && Math.abs(a - b) < 16;
	});
</script>

<div class="viz" bind:this={box}>
	{#if series.length > 1}
		<div class="legend">{#each series as s, k}<span><span class="key" style="background:{colors[k]}"></span>{s.name}</span>{/each}</div>
	{/if}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={title} onpointermove={move} onpointerleave={() => (hover = null)}>
		{#each ticks as t}
			<line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" stroke-width="1" />
			<text x={L - 6} y={y(t) + 4} text-anchor="end" font-size="13" fill="var(--axis)">{Math.round(t)}{unit}</text>
		{/each}
		{#each labels as l, i}
			{#if i === labels.length - 1 || (i % every === 0 && labels.length - 1 - i >= Math.ceil(every / 2))}<text x={x(i)} y={H - 6} text-anchor="middle" font-size="13" fill="var(--axis)">{l}</text>{/if}
		{/each}
		{#each series as s, k}
			<path d={path(s.values)} fill="none" stroke={colors[k]} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
			{#if sparse[k]}
				{#each s.values as v, i}{#if v != null}<circle cx={x(i)} cy={y(v)} r="4" fill={colors[k]} stroke="var(--panel)" stroke-width="2" />{/if}{/each}
			{/if}
			{#if series.length > 1 && lastIdx(s.values) >= 0 && (k === 0 || !labelClash)}
				<text x={x(lastIdx(s.values)) + 8} y={y(s.values[lastIdx(s.values)]!) + 4} font-size="13" fill="var(--text)">{s.name}</text>
			{/if}
		{/each}
		{#if hover != null}<line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--axis)" stroke-width="1" />{/if}
		<rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
	</svg>
	{#if hover != null}
		<div class="tip" style="left:{Math.min(70, (x(hover) / W) * 100)}%;top:0">
			<div class="muted">{labels[hover]}</div>
			{#each series as s, k}<div><span class="key" style="background:{colors[k]}"></span><b>{fmt(s.values[hover])}</b> <span class="muted">{s.name}</span></div>{/each}
		</div>
	{/if}
	<details><summary class="muted small">Table</summary>
		<table class="small"><thead><tr><th></th>{#each series as s}<th>{s.name}</th>{/each}</tr></thead>
			<tbody>{#each labels as l, i}{#if series.some((s) => s.values[i] != null)}<tr><td>{l}</td>{#each series as s}<td>{fmt(s.values[i])}</td>{/each}</tr>{/if}{/each}</tbody>
		</table>
	</details>
</div>
