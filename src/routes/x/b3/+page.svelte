<script lang="ts">
	import { page } from '$app/state';
	import { post } from '$lib/api';
	import { onMount } from 'svelte';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import Feedback from '$lib/components/Feedback.svelte';

	const lang = page.url.searchParams.get('lang') ?? undefined;
	const ds = page.url.searchParams.get('ds');
	let cur = $state<any>(null);
	let sents = $state<string[]>([]);
	let res = $state<any>(null);
	let msg = $state('');
	let busy = $state(false);

	async function next() {
		res = null;
		msg = '';
		cur = await post('/api/b3', { action: 'next', lang, ds });
		sents = Array(cur.need ?? 1).fill('');
	}
	onMount(() => next());
	async function submit() {
		busy = true;
		msg = '';
		try {
			const r = await post('/api/b3', { action: 'submit', attemptId: cur.attemptId, sentences: sents });
			if (!r.ok) msg = r.feedback;
			else res = r;
		} catch (e) {
			msg = String(e);
		}
		busy = false;
	}
</script>

<DrillHeader code="B3" lang={cur?.lang ?? ''} />
<p class="muted small">Sentence practice for words you confirmed in your <a href="/words">inbox</a>. This is separate from the sentence step after a hint or reveal in Definition → word.</p>
{#if cur?.empty}
	<p class="flash">No words in the learning stage{lang ? ' for this language' : ''} that you have not used today. Capture words in the <a href="/words">inbox</a>.</p>
{:else if cur}
	<div class="panel accent">
		<div class="word-big">{cur.word}</div>
		<p class="muted">{cur.definition}</p>
		<div class="bar" style="margin-top:10px"><i style="width:{Math.min(100, (100 * cur.uses) / cur.goal)}%"></i></div>
		<p class="tiny faint num">{cur.uses} of {cur.goal} correct uses · write {cur.need === 1 ? 'one sentence' : 'three sentences in different contexts'}</p>
	</div>
	{#if !res}
		{#each sents as _, i}
			<label for={'s' + i}>Sentence {i + 1}</label>
			<textarea id={'s' + i} bind:value={sents[i]} rows="2"></textarea>
		{/each}
		{#if msg}<p class="flash bad">{msg}</p>{/if}
		<button class="primary lg block" style="margin-top:12px" onclick={submit} disabled={busy || sents.some((s) => !s.trim())}>{busy ? 'Grading… about 10 seconds' : 'Submit'}</button>
	{:else}
		{#if res.graduated}<p class="flash">“{cur.word}” graduated to active.</p>{:else}<p class="muted small">{res.correctUse ? 'Counted as a correct use.' : 'Not counted as a correct use yet.'} {res.uses}/{res.goal} uses on {res.days}/{res.goalDays} days.</p>{/if}
		<Feedback attemptId={res.attemptId} score={res.judge?.score ?? null} feedback={res.judge ? { scores: res.judge.scores, evidence: res.judge.evidence, tips: res.judge.tips, rubric: res.judge.rubricId } : { note: 'Not graded.' }} dim="VOC" />
		<div class="row"><button class="primary" onclick={next}>Next word</button><a class="btn" href={ds ? '/today' : '/drills'}>Done</a></div>
	{/if}
{/if}
