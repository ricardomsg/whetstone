<script lang="ts">
	import { tick } from 'svelte';
	import { post, fmtMs } from '$lib/api';
	import Guidance from '$lib/components/Guidance.svelte';
	import Countdown from '$lib/components/Countdown.svelte';
	import Feedback from '$lib/components/Feedback.svelte';
	let { data } = $props();
	const s = $derived(data.s);

	const mode = $derived(data.mode);
	// note
	let n = $state({ stoppedAt: '', nextAction: '', openRisks: '', waitingOn: '' });
	let noteRes = $state<any>(null);
	let busy = $state(false);
	let actionError = $state('');
	let contextVersion = 0;
	async function saveNote() {
		const version = contextVersion;
		busy = true;
		actionError = '';
		try {
			const result = await post('/api/notes', { session: s.id, ...n, via: 'web' });
			if (version === contextVersion) noteRes = result;
		} catch (e) { if (version === contextVersion) actionError = String(e); }
		finally { if (version === contextVersion) busy = false; }
	}
	// drill
	let drill = $state<any>(null);
	let retro = $state('');
	let pros = $state('');
	let drillRes = $state<any>(null);
	let flow = $state<any>(null);
	let endsAt = $state(0);
	let openError = $state('');
	$effect(() => {
		const sessionId = s.id;
		const nextMode = mode;
		contextVersion++;
		let cancelled = false;
		n = { stoppedAt: '', nextAction: '', openRisks: '', waitingOn: '' };
		noteRes = drill = drillRes = flow = null;
		retro = pros = openError = actionError = '';
		busy = false;
		if (nextMode === 'drill') {
			post('/api/resume', { action: 'open', sessionId }).then((result) => {
				if (cancelled) return;
				drill = result;
				endsAt = Date.now() + 60_000;
			}).catch((e) => { if (!cancelled) openError = String(e); });
		} else if (nextMode === 'note') {
			void tick().then(() => { if (!cancelled) document.getElementById('st')?.focus(); });
		}
		return () => { cancelled = true; };
	});
	async function answer() {
		const version = contextVersion;
		busy = true;
		actionError = '';
		try {
			const result = await post('/api/resume', { action: 'answer', drillId: drill.drillId, retrospective: retro, prospective: pros });
			if (version === contextVersion) drillRes = result;
		} catch (e) { if (version === contextVersion) actionError = String(e); }
		finally { if (version === contextVersion) busy = false; }
	}
	async function backInFlow() {
		const version = contextVersion;
		try {
			const result = await post('/api/resume', { action: 'flow', drillId: drill.drillId });
			if (version === contextVersion) flow = result;
		} catch (e) { if (version === contextVersion) actionError = String(e); }
	}
	const latest = $derived(data.notes[0]);
</script>

<h1>{s.title ?? s.id.slice(0, 8)}</h1>
<p class="muted small">{s.projectPath ?? ''}{s.source === 'claude_code' ? ` · Claude Code ${s.id.slice(0, 8)}` : ''}</p>
<div class="row" data-sveltekit-preload-data="off">
	<a class="btn" class:primary={mode === 'note'} href="/sessions/{s.id}?note=1">Write a note</a>
	{#if data.prompting}<a class="btn" class:primary={mode === 'drill'} href="/sessions/{s.id}?resume=1">Resume drill</a>{:else}<button disabled>Resume drill</button>{/if}
	<a class="btn" class:primary={mode === 'view'} href="/sessions/{s.id}">Notes</a>
</div>

{#if actionError}<p class="flash bad">{actionError}</p>{/if}

{#if mode === 'note'}
	<Guidance code="D1" />
	{#if !noteRes}
		<label for="st">Where I stopped</label><textarea id="st" rows="2" bind:value={n.stoppedAt} placeholder="The artefact, its state, the last result"></textarea>
		<label for="nx">Next concrete action</label><textarea id="nx" rows="2" bind:value={n.nextAction} placeholder="One action, startable in under two minutes"></textarea>
		<label for="rk">Open challenges or risks</label><input id="rk" bind:value={n.openRisks} />
		<label for="wt">Waiting on</label><input id="wt" bind:value={n.waitingOn} />
		<div class="row" style="margin-top:10px"><button class="primary" onclick={saveNote} disabled={busy || !n.stoppedAt.trim() || !n.nextAction.trim()}>{busy ? 'Saving…' : 'Save note'}</button></div>
	{:else}
		<p class="flash">Note saved.</p>
		{#if noteRes.quality}<Feedback attemptId={noteRes.attemptId} score={noteRes.quality.score} feedback={{ scores: noteRes.quality.scores, evidence: noteRes.quality.evidence, tips: noteRes.quality.tips, rubric: noteRes.quality.rubricId }} dim="TRA" />{/if}
	{/if}
{:else if mode === 'drill'}
	<Guidance code="D2" />
	{#if openError}<p class="flash bad">{openError}</p>{:else if !drill}<p class="muted">Opening recall…</p>{/if}
	{#if drill && !drillRes}
		{#if drill.truthSource === 'none'}<p class="flash warn">There is no note for this session{drill.session.source === 'claude_code' ? ' and the transcript summary is off in Settings' : ''}. Your recall will be saved as the note.</p>{/if}
		<div class="row"><Countdown {endsAt} label="Recall: " /><span class="muted small">Answer from memory. The note stays hidden until you submit.</span></div>
		<label for="r1">What were you doing?</label><textarea id="r1" rows="2" bind:value={retro}></textarea>
		<label for="r2">What were you about to do next?</label><textarea id="r2" rows="2" bind:value={pros}></textarea>
		<div class="row" style="margin-top:10px"><button class="primary" onclick={answer} disabled={busy}>{busy ? 'Comparing…' : 'Show the note'}</button></div>
	{:else if drillRes}
		{#if drillRes.truth}
			<div class="side">
				<div class="panel"><h3>You recalled</h3><p><span class="muted small">Doing:</span> {retro || '—'}</p><p><span class="muted small">Next:</span> {pros || '—'}</p></div>
				<div class="panel"><h3>{drill.truthSource === 'transcript' ? 'From the transcript' : 'Your note'}</h3><p><span class="muted small">Stopped at:</span> {drillRes.truth.stoppedAt}</p><p><span class="muted small">Next:</span> {drillRes.truth.nextAction}</p>{#if drillRes.truth.openRisks}<p><span class="muted small">Risks:</span> {drillRes.truth.openRisks}</p>{/if}{#if drillRes.truth.waitingOn}<p><span class="muted small">Waiting on:</span> {drillRes.truth.waitingOn}</p>{/if}</div>
			</div>
			{#if drillRes.attemptId}<Feedback attemptId={drillRes.attemptId} score={drillRes.score} feedback={drillRes.judge ? { scores: drillRes.judge.scores, evidence: drillRes.judge.evidence, tips: drillRes.judge.tips, rubric: drillRes.judge.rubricId } : { note: 'Not graded.' }} dim="TRA" />{/if}
		{:else}
			<p class="flash">Saved your recall as this session's note.</p>
		{/if}
		{#if !flow}<button class="primary" onclick={backInFlow}>Back in flow</button>{:else}<p class="flash">Resume time: {fmtMs(flow.resumeMs)}.</p>{/if}
	{/if}
{:else}
	{#if !data.prompting && latest}<p class="muted small">Resume drills are off, so the note is shown straight away.</p>{/if}
	{#each data.notes as nt}
		<div class="panel">
			<p class="muted small">{new Date(nt.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {nt.via}{nt.quality ? ` · quality ${(nt.quality as any).score}` : ''}</p>
			<p><span class="muted small">Stopped at:</span> {nt.stoppedAt}</p>
			<p><span class="muted small">Next:</span> {nt.nextAction}</p>
			{#if nt.openRisks}<p><span class="muted small">Risks:</span> {nt.openRisks}</p>{/if}
			{#if nt.waitingOn}<p><span class="muted small">Waiting on:</span> {nt.waitingOn}</p>{/if}
		</div>
	{:else}
		<p class="muted">No notes yet.</p>
	{/each}
{/if}
