<script lang="ts">
	import { localDate } from '$lib/core/ids';
	import LineChart from '$lib/components/LineChart.svelte';
	import RecallChart from '$lib/components/RecallChart.svelte';
	import { EXERCISES } from '$lib/content/exercises';
	let { data } = $props();
	const d = (s: string) => s.slice(5);
	const dimsWithData = $derived(Object.keys(data.trends).filter((k) => data.trends[k].some((p: any) => p.n > 0)));
	const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));
	const fl = $derived(data.fluency.slice(-30));
	const res = $derived(data.resume.slice(-30));
</script>

<h1>Progress</h1>
<div class="row small">Range: {#each [7, 28, 90] as n}<a class="btn" class:primary={data.days === n} href="?days={n}">{n} days</a>{/each}</div>

<h2>Benchmark</h2>
{#if data.bench.length}
	{#if data.bench.length >= 2}
		<LineChart title="Benchmark scores" labels={data.bench.map((b) => localDate(b.startedAt, data.timezone).slice(5))} series={[{ name: 'Word retrieval', values: data.bench.map((b) => (b.results as any)?.WR ?? null) }, { name: 'Fluency', values: data.bench.map((b) => (b.results as any)?.FL ?? null) }]} />
	{/if}
	<table class="small">
		<thead><tr><th>Date</th><th>Lang</th><th>Set</th><th>Retrieval</th><th>Unaided</th><th>TOT rate</th><th>Fluency words</th><th>Precision</th></tr></thead>
		<tbody>{#each data.bench as b}{@const r = b.results as any}<tr><td>{new Date(b.startedAt).toLocaleDateString('en-GB')}</td><td>{b.lang}</td><td>{b.parallelSet}</td><td>{r?.WR != null ? Math.round(r.WR) : '—'}</td><td>{pct(r?.unaidedRate) ?? '—'}%</td><td>{pct(r?.totRate) ?? '—'}%</td><td>{r?.fluencyValid != null ? Math.round(r.fluencyValid) : '—'}</td><td>{r?.PR != null ? Math.round(r.PR) : '—'}</td></tr>{/each}</tbody>
	</table>
{:else}
	<p class="muted">No benchmark yet. <a href="/benchmark">Take the first one</a>: it is the measure of real progress.</p>
{/if}

<h2>Where you struggle</h2>
{#if data.weak.length}
	<ol>{#each data.weak as w}<li><b>{w.label}</b> <span class="muted small">— {Math.round(w.failRate * 100)}% of {w.attempts} attempts needed help or scored under 60</span></li>{/each}</ol>
{:else}<p class="muted">Needs at least five attempts in an area.</p>{/if}

<h2>Skills, 7-day rolling mean</h2>
{#each dimsWithData as k}
	<div class="panel"><b>{data.dims[k]}</b><LineChart title={data.dims[k]} labels={data.trends[k].map((p: any) => d(p.date))} series={[{ name: '7-day mean', values: data.trends[k].map((p: any) => p.r7) }]} /></div>
{:else}<p class="muted">No scored attempts in this range.</p>{/each}

<h2>Tip-of-the-tongue rate in drills, by week</h2>
<LineChart title="TOT rate" unit="%" labels={data.tot.map((w: any) => (w.weeksAgo ? `-${w.weeksAgo}w` : 'now'))} series={[{ name: 'English', values: data.tot.map((w: any) => pct(w.en)) }, { name: 'Português', values: data.tot.map((w: any) => pct(w.pt)) }]} />
<p class="muted small">Real-life captures, last 12 weeks: {data.tot.reduce((a: number, w: any) => a + w.logEn, 0)} English, {data.tot.reduce((a: number, w: any) => a + w.logPt, 0)} Portuguese.</p>

<h2>Word Rush</h2>
{#if fl.length}
	<LineChart title="Fluency valid words" yMax={Math.max(30, ...fl.map((f: any) => f.valid))} labels={fl.map((f: any) => localDate(f.t, data.timezone).slice(5))} series={[{ name: 'Valid words', values: fl.map((f: any) => f.valid) }, { name: 'Your baseline', values: fl.map((f: any) => f.base) }]} />
{:else}<p class="muted">No sprints yet.</p>{/if}

<h2>Vocabulary</h2>
<div class="tiles">
	<div class="tile"><div class="v">{data.funnel.inbox}</div><div class="l">in the inbox</div></div>
	<div class="tile"><div class="v">{data.funnel.learning}</div><div class="l">learning</div></div>
	<div class="tile"><div class="v">{data.funnel.active}</div><div class="l">active</div></div>
	<div class="tile"><div class="v">{data.funnel.totCards}</div><div class="l">tip-of-the-tongue cards</div></div>
	<div class="tile"><div class="v">{data.funnel.sticky}</div><div class="l">sticky words</div></div>
</div>

<h2>Conversation recall</h2>
{#if data.threadRecall.length}
	<RecallChart points={data.threadRecall} />
	<p class="small muted">Recall score (coverage and correctness) against time since the recap was captured, for attempts in the last {data.days} days. Different conversations vary in difficulty.</p>
{:else}<p class="muted">Capture a <a href="/capture/recap">conversation recap</a>, confirm its key points and return when recall is due. Graded attempts appear here.</p>{/if}

<h2>Resuming work</h2>
{#if res.length}
	<LineChart title="Resume scores" labels={res.map((r: any) => localDate(r.t, data.timezone).slice(5))} series={[{ name: 'Recall', values: res.map((r: any) => (r.exercise === 'D2' ? r.score : null)) }, { name: 'Note quality', values: res.map((r: any) => (r.exercise === 'D1' ? r.score : null)) }]} />
{:else}<p class="muted">No notes or resume drills yet.</p>{/if}

<h2>Your state</h2>
<p class="muted">Check-in days recorded: {data.state.days}. Correlations with sleep, energy, stress and exercise are planned.</p>

<h2>Score disputes</h2>
<p class="muted small">Attempts from the last {data.days} days with a successful rubric grade. Each attempt counts once, even if you edited its score several times. Whole-score disputes count for the drill, but not for an individual criterion.</p>
{#each data.disputes as drill}
	<div class="panel">
		<b>{EXERCISES[drill.exercise]?.title ?? drill.exercise}</b>
		<p>{drill.disputed} of {drill.judged} judged attempts disputed ({Math.round(drill.rate * 100)}%).</p>
		<table class="small">
			<thead><tr><th>Criterion</th><th>Disputed / judged</th><th>Share</th></tr></thead>
			<tbody>{#each drill.criteria as c}<tr><td>{c.criterion.replaceAll('_', ' ')}</td><td>{c.disputed} / {c.judged}</td><td>{Math.round(c.rate * 100)}%</td></tr>{/each}</tbody>
		</table>
	</div>
{:else}<p class="muted">No rubric-graded attempts in this range.</p>{/each}

<p class="muted small">{data.streak}-day streak · {data.overrides} score override{data.overrides === 1 ? '' : 's'} logged · <a href="/attempts">all attempts</a></p>
