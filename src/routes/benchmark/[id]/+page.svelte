<script lang="ts">
	let { data } = $props();
	const href: Record<string, string> = { A1: '/x/a1', A2: '/x/a2', A4: '/x/a4' };
	const res = $derived(data.run.results as any);
</script>

<h1>Benchmark · {data.run.lang === 'pt-PT' ? 'Português' : 'English'} · set {data.run.parallelSet}</h1>
<table>
	<tbody>
		{#each data.steps as s}
			<tr><td>{s.label}</td><td>{s.done}/{s.count}</td><td>{s.avg != null ? Math.round(s.avg) : s.scored != null && s.done >= s.count ? 'not scored' : ''}{#if s.scored != null && s.done > 0} <span class="tiny faint">{s.scored} of {s.done} checked</span>{/if}</td><td>{#if data.current?.key === s.key}<a class="btn primary" href="{href[s.key]}?bench={data.run.id}">Next item</a>{:else if s.done >= s.count}<span class="tag good">done</span>{/if}</td></tr>
		{/each}
	</tbody>
</table>
{#if data.steps.some((s) => s.scored != null && s.done >= s.count && s.avg == null)}
	<p class="muted small">Word Rush needs one checked round of each kind for a fluency result, so this run has none.</p>
{/if}
{#if res}
	<div class="tiles" style="margin-top:12px">
		<div class="tile"><div class="v">{res.WR != null ? Math.round(res.WR) : '—'}</div><div class="l">word retrieval</div></div>
		<div class="tile"><div class="v">{res.totRate != null ? Math.round(res.totRate * 100) + '%' : '—'}</div><div class="l">tip-of-the-tongue rate</div></div>
		<div class="tile"><div class="v">{res.fluencyValid != null ? Math.round(res.fluencyValid) : '—'}</div><div class="l">fluency words per sprint</div></div>
		<div class="tile"><div class="v">{res.PR != null ? Math.round(res.PR) : '—'}</div><div class="l">precision</div></div>
	</div>
	<p class="muted small">Plotted on the Progress page. The next run uses a different, matched set.</p>
{:else}
	<p class="muted small">Each "Next item" opens one item and brings you back here. Items come from a reserved set you never practise.</p>
{/if}
