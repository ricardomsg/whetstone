<script lang="ts">
	import { post, fmtMs } from '$lib/api';
	import Guidance from './Guidance.svelte';
	import Feedback from './Feedback.svelte';
	import Countdown from './Countdown.svelte';
	let { setup }: { setup: { threadId: string; exercise: string; lang: string; due: number | null } } = $props();
	let drill = $state<any>(null), result = $state<any>(null), busy = $state(false), message = $state('');
	let recall = $state(''), opener = $state('');
	async function begin() {
		busy = true; message = '';
		try { drill = await post('/api/threads', { action: 'begin', threadId: setup.threadId, exercise: setup.exercise }); }
		catch (e) { message = String(e); } finally { busy = false; }
	}
	async function answer(event: SubmitEvent) {
		event.preventDefault(); busy = true; message = '';
		try { result = await post('/api/threads', { action: 'answer', attemptId: drill.attemptId, recall, opener }); }
		catch (e) { message = String(e); } finally { busy = false; }
	}
</script>
<a class="btn ghost sm" href="/threads">Conversations</a>
<h1>{setup.exercise === 'C2' ? 'Delayed recall' : 'Re-entry drill'}</h1>
<Guidance code={setup.exercise} />
{#if !drill}
	<p class="muted">The cue appears when you start. Recall first; the saved key points are shown after you submit.</p>
	<button class="primary lg block" onclick={begin} disabled={busy}>{busy ? 'Opening…' : 'Show cue and start'}</button>
{:else if !result}
	<div class="panel accent"><p class="definition">{drill.cue}</p>{#if setup.exercise === 'C3'}<Countdown endsAt={drill.startedAt + 60_000} label="Re-entry: " />{/if}</div>
	<form onsubmit={answer}>
		{#if setup.exercise === 'C3'}<label for="opener">Your restating opener</label><textarea id="opener" bind:value={opener} maxlength="1500" rows="2" placeholder="Right, the … — last time we…"></textarea>{/if}
		<label for="recall">Where does it stand, and what is still open?</label><textarea id="recall" bind:value={recall} maxlength="6000" rows="5"></textarea>
		<button class="primary lg block" disabled={busy}>{busy ? 'Comparing with the key points…' : 'Submit and compare'}</button>
		<p class="small muted">It is fine to leave this blank if you cannot recall it.</p>
	</form>
{:else}
	<div class="panel"><div class="eyebrow">Your recall</div>{#if result.input.opener}<p style="white-space:pre-wrap">{result.input.opener}</p>{/if}<p style="white-space:pre-wrap">{result.input.recall || 'Nothing recalled.'}</p></div>
	<Feedback attemptId={result.attemptId} score={result.score} feedback={result.feedback} dim="TRP" />
	<div class="panel"><h2 style="margin-top:0">Key points at the start of this drill</h2>{#each result.points as p}<p><span class="tag">{p.kind}</span> {p.text}</p>{/each}</div>
	<p class="small muted">Time: {fmtMs(result.metrics.elapsedMs)}{#if setup.exercise === 'C3'} · speed score {result.metrics.speed}/100 (20% of the overall score){/if}{#if result.metrics.nextDue} · next recall {new Date(result.metrics.nextDue).toLocaleString('en-GB')}{/if}</p>
	<a class="btn primary" href="/threads">Back to conversations</a>
{/if}
{#if message}<p class="flash bad">{message}</p>{/if}
