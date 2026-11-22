<script lang="ts">
	import { EXERCISES, langLabel } from '$lib/content/exercises';
	import Ico from '$lib/components/Ico.svelte';
	import Feedback from '$lib/components/Feedback.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { fmtMs, post } from '$lib/api';
	let { data } = $props();
	let ref = $state<any>(null);
	let refBusy = $state(false);
	async function getRef() {
		refBusy = true;
		try {
			ref = (await post('/api/a4', { action: 'reference', itemId: data.itemId })).reference;
		} finally {
			refBusy = false;
		}
	}
	const reference = $derived(ref ?? data.prompt?.reference ?? null);
	const r = $derived(data.row);
	const m = $derived(EXERCISES[r.exercise]);
	const p = $derived(data.prompt ?? {});
	const i = $derived(data.input);
	const mt = $derived(data.metrics);
	const when = $derived(new Date(r.at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }));
	const verdict: Record<string, string> = { correct: 'right', near_miss: 'right word, other form', synonym: 'accepted synonym', close: 'close', wrong: 'not it', trap: 'false friend', cue: 'the word in the other language' };
</script>

<a class="btn ghost sm" href="/history"><ArrowLeft size={15} /> History</a>
<div class="row nowrap" style="margin:10px 0 4px">
	<Ico icon={m.icon} skill={m.skill} size={44} />
	<div><h1 style="margin:0">{r.title}</h1><div class="muted small">{m.title} · {langLabel(r.lang)} · {when}</div></div>
</div>

<div class="panel">
	<div class="eyebrow">What you were given</div>
	{#if r.exercise === 'A1' || r.exercise === 'B2'}
		<p class="definition">{p.definition}</p>
		{#if p.example}<p class="quote">“{p.example}”</p>{/if}
	{:else if r.exercise === 'A8'}
		<p class="definition">{p.cue}</p>
		{#if p.context}<p class="quote">“{p.context}”</p>{/if}
	{:else if r.exercise === 'A2'}
		<p class="definition">{p.kind === 'letter' ? `Words starting with ${String(p.prompt).toUpperCase()}` : p.prompt}</p>
		<p class="muted small">60 seconds</p>
	{:else if r.exercise === 'A4'}
		<p class="definition">{p.sentence}</p>
		<p class="muted small">Flat word: <b>{data.flat}</b> · register: {String(p.register ?? '').replace(/-/g, ' ')}</p>
	{:else if r.exercise === 'B3'}
		<p class="definition">Use <b>{r.title}</b> in {i.need === 3 ? 'three sentences' : 'a sentence'} of your own.</p>
	{:else if r.exercise === 'D1' || r.exercise === 'D2'}
		<p class="definition">{r.subtitle}</p>
	{:else if r.exercise === 'C1' || r.exercise === 'C2' || r.exercise === 'C3'}
		<p class="definition">{i.cue ?? `${i.person} — ${i.topic}`}</p>
	{/if}
</div>

<div class="panel">
	<div class="eyebrow">What you did</div>
	{#if r.exercise === 'A1' || r.exercise === 'A8'}
		{#if i.states?.length}<p class="small">Marked {i.states.map((s: any) => (s.state === 'tot' ? 'tip of tongue' : "don't know") + ` at ${fmtMs(s.at)}`).join(', ')}.</p>{/if}
		{#each i.answers ?? [] as a}<p>“{a.text}” <span class="muted small">at {fmtMs(a.at)} — {verdict[a.verdict] ?? a.verdict}</span></p>{/each}
		<p class="small muted">Hints used: {mt.hints ?? 0}{mt.revealed ? ' · then revealed' : ''}</p>
		{#if i.sentence}<p>Your sentence: “{i.sentence}”</p>{/if}
		{#if data.target}<p>{r.exercise === 'A8' ? 'The translation' : 'The word'}: <span class="word-big" style="font-size:1.3rem">{data.target}</span>{#if r.exercise === 'A8' && p.accept?.length}<span class="muted small"> · also {p.accept.join(', ')}</span>{/if}</p>{/if}
		{#if r.exercise === 'A8' && data.target && p.note}<p class="small muted">{p.note}</p>{/if}
	{:else if r.exercise === 'A2'}
		<p>{(i.words ?? []).join(' · ') || '—'}</p>
		{#if mt.intrusionWords?.length}<p class="small muted">Not counted: {mt.intrusionWords.join(', ')}</p>{/if}
		<p class="small muted">{mt.valid} valid · {mt.repetitions} repeated · {mt.clusters} clusters (mean size {mt.meanClusterSize}) · {mt.switches} switches{mt.baselineMean != null ? ` · your baseline then ${mt.baselineMean}` : ''}</p>
	{:else if r.exercise === 'A4'}
		<p>Alternatives: {(i.alternatives ?? []).join(', ')}</p>
		<p>Your pick: <b>{i.pick}</b></p>
		<p class="muted">“{i.justification}”</p>
		<div class="divider"></div>
		{#if reference}
			<div class="eyebrow">Alternatives to learn from</div>
			{#each reference.alternatives as alt}<p class="small"><b style="color:{alt.fits ? 'var(--text)' : 'var(--bad)'};{alt.fits ? '' : 'text-decoration:line-through'}">{alt.word}</b> <span class="muted">— {alt.nuance}</span></p>{/each}
			<p class="small">Best here: <b>{reference.best.word}</b> <span class="muted">— {reference.best.why}</span></p>
		{:else}
			<button onclick={getRef} disabled={refBusy}>{refBusy ? 'Looking… about 15 seconds' : 'Show alternatives to learn from'}</button>
		{/if}
	{:else if r.exercise === 'B2'}
		{#each i.answers ?? [] as a}<p>“{a.text ?? '(revealed)'}” <span class="muted small">at {fmtMs(a.at)}</span></p>{/each}
		<p class="small muted">Hints {mt.hints ?? 0} · grade computed {mt.computedGrade} · final {mt.finalGrade}</p>
		{#if data.target}<p>The word: <b>{data.target}</b></p>{/if}
	{:else if r.exercise === 'B3'}
		{#each i.sentences ?? [] as s}<p>“{s}”</p>{/each}
	{:else if r.exercise === 'D1' && data.note}
		<p><span class="muted small">Stopped at:</span> {data.note.stoppedAt}</p>
		<p><span class="muted small">Next:</span> {data.note.nextAction}</p>
		{#if data.note.openRisks}<p><span class="muted small">Risks:</span> {data.note.openRisks}</p>{/if}
		{#if data.note.waitingOn}<p><span class="muted small">Waiting on:</span> {data.note.waitingOn}</p>{/if}
	{:else if r.exercise === 'D2'}
		<p><span class="muted small">What you were doing:</span> {i.retrospective || '—'}</p>
		<p><span class="muted small">What came next:</span> {i.prospective || '—'}</p>
	{:else if r.exercise === 'C1'}
		<p style="white-space:pre-wrap">{i.recap}</p>
	{:else if r.exercise === 'C2' || r.exercise === 'C3'}
		{#if i.opener}<p><span class="muted small">Opener:</span> {i.opener}</p>{/if}
		<p style="white-space:pre-wrap">{i.recall || 'Nothing recalled.'}</p>
		{#if r.finished}<p class="small muted">Time: {fmtMs(mt.elapsedMs)}{#if mt.speed != null} · speed score {mt.speed}/100{/if}</p>{/if}
		{#if data.threadReference}<h3>Reference at the start of this drill</h3>{#each data.threadReference as point}<p><span class="tag">{point.kind}</span> {point.text}</p>{/each}{/if}
	{/if}
</div>

{#if r.dim && data.feedback?.scores}
	<Feedback attemptId={r.id} score={r.score} feedback={data.feedback} dim={r.dim} details={false} />
{:else if r.score != null}
	<div class="panel"><div class="row"><span class="score">{r.score}</span><span class="muted">/ 100 · {r.dim}</span></div></div>
{/if}

{#if data.overrides.length}
	<h2>Your disputes</h2>
	<div class="panel flat">{#each data.overrides as o}<p class="small">{o.criterion === '_score' ? 'Overall score' : o.criterion.replace(/_/g, ' ')}: {o.oldScore} → <b>{o.newScore}</b> <span class="muted">— {o.reason}</span></p>{/each}</div>
{/if}

{#if data.evals.length}
	<details class="panel flat">
		<summary class="muted small">Audit: {data.evals.length} model call{data.evals.length > 1 ? 's' : ''}</summary>
		<table class="small">
			<thead><tr><th>Purpose</th><th>Model</th><th>Rubric</th><th>Tokens</th></tr></thead>
			<tbody>{#each data.evals as e}<tr><td>{e.purpose}{e.ok ? '' : ' ✗'}</td><td>{e.model}</td><td>{e.rubricId ? `v${e.rubricVersion}` : '—'}</td><td class="num">{e.tokensIn}/{e.tokensOut}</td></tr>{/each}</tbody>
		</table>
	</details>
{/if}
