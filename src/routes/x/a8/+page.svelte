<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { post, fmtMs } from '$lib/api';
	import Countdown from '$lib/components/Countdown.svelte';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import ScoreRing from '$lib/components/ScoreRing.svelte';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import Eye from '@lucide/svelte/icons/eye';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	// lang is the language of the answer: pt-PT means English cue → Portuguese answer.
	const lang = page.url.searchParams.get('lang') === 'en' ? 'en' : 'pt-PT';
	const pt = lang === 'pt-PT';
	const ds = page.url.searchParams.get('ds');
	let itemParam = page.url.searchParams.get('item');
	const total = Number(page.url.searchParams.get('n') ?? 8);

	let n = $state(0);
	let finished = $state(0);
	let cur = $state<any>(null);
	let answer = $state('');
	let sentence = $state('');
	let hints = $state<{ level: number; label: string; text: string }[]>([]);
	let states = $state<string[]>([]);
	let windowOpen = $state(false);
	let revealed = $state<string | null>(null);
	let needSentence = $state(false);
	let msg = $state<{ kind: string; text: string } | null>(null);
	let result = $state<any>(null);
	let busy = $state(false);
	let err = $state('');
	let input: HTMLInputElement | undefined = $state();
	let sInput: HTMLInputElement | undefined = $state();
	const LADDER = [pt ? 'In Portuguese' : 'In English', 'Shape', 'First sound', 'Ending'];

	async function next() {
		err = '';
		result = null;
		answer = '';
		sentence = '';
		hints = [];
		states = [];
		revealed = null;
		needSentence = false;
		msg = null;
		windowOpen = false;
		try {
			cur = await post('/api/a8', { action: 'start', lang, ds, item: itemParam });
			itemParam = null;
			n += 1;
			await tick();
			input?.focus();
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
	}
	onMount(next);

	async function submit() {
		if (!answer.trim() || busy) return;
		busy = true;
		try {
			const r = await post('/api/a8', { action: 'answer', attemptId: cur.attemptId, text: answer });
			if (r.done) {
				result = r.result;
				finished += 1;
				msg = r.note ? { kind: 'good', text: r.note } : null;
			} else if (r.needSentence) {
				needSentence = true;
				revealed = r.target;
				msg = r.note ? { kind: 'good', text: r.note } : null;
				await tick();
				sInput?.focus();
			} else {
				const warn = r.verdict === 'close' || r.verdict === 'cue';
				msg = { kind: warn ? 'warn' : 'bad', text: r.verdict === 'close' ? `Close, but not quite. ${r.note}` : r.verdict === 'wrong' ? `Not it. ${r.note ?? ''}` : r.note };
				answer = '';
				input?.focus();
			}
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
		busy = false;
	}

	async function mark(state: 'tot' | 'dont_know') {
		await post('/api/a8', { action: 'state', attemptId: cur.attemptId, state });
		states = [...states, state];
		input?.focus();
	}

	async function hint(giveUp = false) {
		if (busy) return;
		busy = true;
		try {
			const r = await post('/api/a8', { action: 'hint', attemptId: cur.attemptId, giveUp });
			if (r.reveal) {
				revealed = r.text;
				needSentence = true;
				msg = null;
				await tick();
				sInput?.focus();
			} else hints = [...hints, r];
		} catch (e) {
			msg = { kind: 'warn', text: String(e).replace('Error: ', '') };
		}
		busy = false;
		if (!needSentence) input?.focus();
	}

	async function submitSentence() {
		if (!sentence.trim() || busy) return;
		busy = true;
		try {
			const r = await post('/api/a8', { action: 'sentence', attemptId: cur.attemptId, text: sentence });
			if (r.ok) {
				result = r.result;
				finished += 1;
				msg = r.feedback ? { kind: 'good', text: r.feedback } : null;
			} else msg = { kind: 'bad', text: r.feedback };
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
		busy = false;
	}

	function onkey(e: KeyboardEvent) {
		if (result && e.key === 'Enter') return go();
		if (!cur || result) return;
		if (e.altKey && e.key.toLowerCase() === 't') (e.preventDefault(), mark('tot'));
		if (e.altKey && e.key.toLowerCase() === 'h' && windowOpen) (e.preventDefault(), hint());
	}
	function go() {
		if (n < total) next();
		else location.href = ds ? '/' : '/drills';
	}

	/** The context sentence with the cue picked out. */
	function parts(context: string, cue: string): [string, string, string] {
		const i = context.toLowerCase().indexOf(cue.toLowerCase());
		if (i < 0) return [context, '', ''];
		return [context.slice(0, i), context.slice(i, i + cue.length), context.slice(i + cue.length)];
	}
	const STATE: Record<string, [string, string]> = { correct: ['Found it', 'good'], synonym: ['Accepted alternative', 'good'], near_miss: ['Right word, other form', 'warn'], revealed: ['Revealed', 'bad'] };
</script>

<svelte:window onkeydown={onkey} />

<DrillHeader code="A8" {n} {total} done={finished} {lang} />
{#if err}<p class="flash bad">{err}</p>{/if}

{#if cur && !result}
	{@const [before, cue, after] = parts(cur.item.context, cur.item.cue)}
	<div class="panel prompt">
		<div class="row small">
			<span class="eyebrow">{pt ? 'English → Português' : 'Português → English'}</span>
			{#if cur.item.kind && cur.item.kind !== 'word'}<span class="tag">{cur.item.kind === 'idiom' ? 'expression' : 'phrase'}</span>{/if}
			{#if cur.item.source === 'missed'}<span class="tag warn">one you missed</span>{/if}
		</div>
		<p class="cue">{cur.item.cue}</p>
		{#if cur.item.context}<p class="quote">“{before}<b class="hl">{cue}</b>{after}”</p>{/if}
	</div>

	{#if !needSentence}
		<p class="small muted aloud">Say it out loud first, then type it.</p>
		<form onsubmit={(e) => (e.preventDefault(), submit())} class="answer">
			<input bind:this={input} class="big-input" bind:value={answer} placeholder={pt ? 'Em português…' : 'In English…'} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" lang={lang} />
			<button class="primary lg" type="submit" disabled={busy || !answer.trim()} aria-label="Check"><ArrowRight size={20} /></button>
		</form>
		<div class="row" style="margin-top:10px">
			<button class="warm" onclick={() => mark('tot')} disabled={states.includes('tot')}>{states.includes('tot') ? 'On the tip of your tongue' : 'Tip of my tongue'} <span class="kbd">Alt T</span></button>
			<button class="ghost" onclick={() => mark('dont_know')} disabled={states.includes('dont_know')}>I don't know it</button>
		</div>
		{#if msg}<p class="flash {msg.kind === 'bad' ? 'bad' : msg.kind === 'warn' ? 'warn' : ''} pop">{msg.text}</p>{/if}

		<div class="panel flat ladder">
			<div class="row">
				<Lightbulb size={18} color="var(--warm)" />
				<b>Hints</b>
				<span class="spacer"></span>
				{#if !windowOpen}<span class="muted small">keep trying</span><Countdown endsAt={cur.startedAt + cur.effortWindowMs} onend={() => (windowOpen = true)} />{/if}
			</div>
			<div class="rungs">
				{#each LADDER as l, k}
					<div class="rung" class:used={k < hints.length} class:wide={k === 0}>
						<span class="dot num">{k + 1}</span>
						<div style="min-width:0"><div class="tiny faint">{l}</div>{#if hints[k]}<div class="hint pop">{hints[k].text}</div>{/if}</div>
					</div>
				{/each}
			</div>
			<div class="row" style="margin-top:10px">
				<button onclick={() => hint()} disabled={!windowOpen || busy}>{hints.length >= 4 ? 'Reveal' : `Hint ${hints.length + 1}`} <span class="kbd">Alt H</span></button>
				<span class="spacer"></span>
				{#if !windowOpen}<button class="ghost sm" onclick={() => hint(true)}><Eye size={14} /> Give up</button>{/if}
			</div>
			<p class="tiny faint" style="margin:8px 0 0">The first hint puts you in a {pt ? 'Portuguese' : 'English'} sentence; the rest give shape and sounds. Each costs 15 points.</p>
		</div>
	{:else}
		<div class="panel accent pop">
			<div class="eyebrow">{pt ? 'Em português' : 'In English'}</div>
			<div class="word-big">{revealed}</div>
			<p class="muted small">Say it out loud once. Then use it in a sentence of your own{pt ? ', in Portuguese' : ''}: producing it is what makes it stick.</p>
			<form onsubmit={(e) => (e.preventDefault(), submitSentence())} class="answer">
				<input bind:this={sInput} bind:value={sentence} placeholder={pt ? 'A tua frase…' : 'Your sentence…'} autocomplete="off" enterkeyhint="send" lang={lang} />
				<button class="primary" type="submit" disabled={busy || !sentence.trim()}>{busy ? 'Checking…' : 'Submit'}</button>
			</form>
			{#if msg}<p class="flash {msg.kind === 'bad' ? 'bad' : ''}">{msg.text}</p>{/if}
		</div>
	{/if}
{/if}

{#if result}
	{@const st = STATE[result.state] ?? [result.state, '']}
	<div class="panel pop result">
		<div class="row nowrap">
			<ScoreRing score={result.score} label="WR" />
			<div style="flex:1;min-width:0">
				<span class="tag {st[1]}">{st[0]}</span>
				<div class="muted small" style="margin-top:6px">{result.cue}</div>
				<div class="word-big">{result.target}</div>
				{#if result.accept?.length}<div class="muted small">Also right: {result.accept.join(', ')}</div>{/if}
			</div>
		</div>
		{#if result.trap}<p class="small"><span class="tag bad">trap</span> “{result.trap}” {result.metrics.trapHit ? 'caught you here.' : 'is the tempting wrong answer.'}</p>{/if}
		{#if result.note}<p class="small muted">{result.note}</p>{/if}
		<div class="facts">
			<div><span class="tiny faint">Time</span><b class="num">{fmtMs(result.metrics.latencyMs)}</b></div>
			<div><span class="tiny faint">Hints</span><b class="num">{result.metrics.hints}</b></div>
			{#if result.rating}<div><span class="tiny faint">Rating {pt ? 'PT' : 'EN'}</span><b class="num">{Math.round(result.rating.before)} → {Math.round(result.rating.after)}</b></div>{/if}
		</div>
		{#if msg}<p class="small muted">{msg.text}</p>{/if}
		{#if result.addedToDeck}<p class="small muted">Added to your review deck, so it comes back spaced out.</p>{/if}
	</div>
	<button class="primary lg block" onclick={go}>{n < total ? 'Next' : ds ? 'Back to today' : 'Done'} <ArrowRight size={18} /></button>
{/if}

<style>
	.prompt .cue { font-size: 1.7rem; font-weight: 700; margin: 6px 0 4px; }
	.hl { color: var(--text); font-style: normal; }
	.aloud { margin: 14px 0 8px; }
	.answer { display: flex; gap: 10px; }
	.answer input { flex: 1; }
	.ladder { margin-top: 16px; }
	.rungs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
	.rung.wide { grid-column: 1 / -1; }
	@media (max-width: 560px) { .rungs { grid-template-columns: 1fr 1fr; } }
	.rung { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line-soft); min-height: 48px; }
	.rung.used { border-color: rgba(226, 184, 107, 0.4); background: var(--warm-soft); }
	.dot { width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; font-size: 0.72rem; font-weight: 700; background: var(--panel-3); color: var(--muted); flex: none; }
	.rung.used .dot { background: var(--warm); color: #2a1f08; }
	.hint { font-weight: 600; font-size: 0.92rem; margin-top: 2px; overflow-wrap: anywhere; }
	.result { margin-bottom: 14px; }
	.facts { display: flex; gap: 24px; margin: 14px 0 4px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
	.facts div { display: flex; flex-direction: column; }
</style>
