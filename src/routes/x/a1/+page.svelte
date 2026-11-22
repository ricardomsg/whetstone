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

	const ds0 = page.url.searchParams.get('ds');
	const bench = page.url.searchParams.get('bench');
	const total = Number(page.url.searchParams.get('n') ?? (bench ? 1 : 5));
	// Chosen languages (/x/a1/setup): read the definition in `def`, answer in each of `ans`, in that order.
	const NAMES: Record<string, string> = { en: 'English', 'pt-PT': 'Português' };
	const defParam = page.url.searchParams.get('def');
	const def = defParam === 'en' || defParam === 'pt-PT' ? defParam : null;
	const ans = (page.url.searchParams.get('ans') ?? '').split(',').filter((l, i, a) => (l === 'en' || l === 'pt-PT') && a.indexOf(l) === i);
	const cross = !bench && !!def && ans.length > 0 && !(ans.length === 1 && ans[0] === def);
	// Definition and answer in the same single language is a normal round in that language.
	const lang = page.url.searchParams.get('lang') ?? (def && ans.length === 1 ? ans[0] : 'en');
	// Cross rounds are not daily-plan steps: one concept makes several attempts.
	const ds = cross ? null : ds0;
	let step = $state(0);
	let conceptId: string | null = null;
	let earlier = $state<{ lang: string; word: string; state: string }[]>([]);

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
	const LADDER = ['Syllables', 'First sound', 'Sounds like', 'Last sound'];

	async function next(toStep = 0, done?: { lang: string; word: string; state: string }) {
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
			if (cross) {
				cur = await post('/api/a1', { action: 'start', lang: ans[toStep], def, concept: toStep > 0 ? conceptId : null });
				earlier = toStep === 0 ? [] : done ? [...earlier, done] : earlier;
				step = toStep;
				if (toStep === 0) n += 1;
				conceptId = cur.conceptId;
			} else {
				cur = await post('/api/a1', { action: 'start', lang, ds, bench });
				n += 1;
			}
			await tick();
			input?.focus();
		} catch (e) {
			err = String(e).replace('Error: ', '');
			if (cross) cur = null; // never leave a finished card on screen to answer again
		}
	}
	onMount(() => {
		if (def && !ans.length) location.href = '/x/a1/setup';
		else next();
	});

	async function submit() {
		if (!answer.trim() || busy) return;
		busy = true;
		try {
			const r = await post('/api/a1', { action: 'answer', attemptId: cur.attemptId, text: answer });
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
				msg = { kind: r.verdict === 'close' ? 'warn' : 'bad', text: r.verdict === 'close' ? `Close, but not the word. ${r.note}` : `Not it. ${r.note ?? ''}` };
				answer = '';
				input?.focus();
			}
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
		busy = false;
	}

	async function mark(state: 'tot' | 'dont_know') {
		await post('/api/a1', { action: 'state', attemptId: cur.attemptId, state });
		states = [...states, state];
		input?.focus();
	}

	async function hint(giveUp = false) {
		if (busy) return;
		busy = true;
		try {
			const r = await post('/api/a1', { action: 'hint', attemptId: cur.attemptId, giveUp });
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
			const r = await post('/api/a1', { action: 'sentence', attemptId: cur.attemptId, text: sentence });
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
		if (cross && step < ans.length - 1) {
			return next(step + 1, { lang: ans[step], word: result.target, state: result.state });
		}
		if (bench) location.href = '/benchmark/' + bench;
		else if (n < total) next();
		else location.href = ds ? '/' : '/drills';
	}
	const STATE: Record<string, [string, string]> = { correct: ['Found it', 'good'], synonym: ['Accepted synonym', 'good'], near_miss: ['Right word, other form', 'warn'], revealed: ['Revealed', 'bad'] };
</script>

<svelte:window onkeydown={onkey} />

<DrillHeader code="A1" {n} {total} done={cross ? Math.floor(finished / ans.length) : finished} lang={cross ? (ans.length > 1 ? 'mixed' : ans[0]) : lang} guide={!bench} />
{#if err}<p class="flash bad">{err}</p>{/if}

{#if cur && !result}
	<div class="panel prompt">
		{#if cross}
			<div class="row small cross">
				<span class="eyebrow">Definition in {NAMES[def!]} · answer in {ans.map((l) => NAMES[l]).join(', then ')}</span>
				{#if ans.length > 1}<span class="tag">{step + 1} of {ans.length}</span>{/if}
			</div>
			{#each earlier as e}<p class="small muted earlier">{NAMES[e.lang]}: <b>{e.word}</b></p>{/each}
		{/if}
		<div class="row small">{#if cur.item.pos}<span class="tag">{cur.item.pos}</span>{/if}{#if cur.item.source !== 'seed'}<span class="tag warn">from your {cur.item.source === 'tot_log' ? 'tip-of-the-tongue log' : 'inbox'}</span>{/if}</div>
		<p class="definition">{cur.item.definition}</p>
		{#if cur.item.example}<p class="quote">“{cur.item.example}”</p>{/if}
	</div>

	{#if !needSentence}
		<form onsubmit={(e) => (e.preventDefault(), submit())} class="answer">
			<input bind:this={input} class="big-input" bind:value={answer} placeholder={cross ? `The word in ${NAMES[ans[step]]}…` : 'Type the word…'} lang={cross ? ans[step] : lang} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" />
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
				<b>Sound hints</b>
				<span class="spacer"></span>
				{#if !windowOpen}<span class="muted small">keep trying</span><Countdown endsAt={cur.startedAt + cur.effortWindowMs} onend={() => (windowOpen = true)} />{/if}
			</div>
			<div class="rungs">
				{#each LADDER as l, k}
					<div class="rung" class:used={k < hints.length}>
						<span class="dot num">{k + 1}</span>
						<div style="min-width:0"><div class="tiny faint">{l}</div>{#if hints[k]}<div class="hint pop">{hints[k].text}</div>{/if}</div>
					</div>
				{/each}
			</div>
			<div class="row" style="margin-top:10px">
				<button onclick={() => hint()} disabled={!windowOpen || busy}>{hints.length >= 4 ? 'Reveal the word' : `Hint ${hints.length + 1}`} <span class="kbd">Alt H</span></button>
				<span class="spacer"></span>
				{#if !windowOpen}<button class="ghost sm" onclick={() => hint(true)}><Eye size={14} /> Give up</button>{/if}
			</div>
			<p class="tiny faint" style="margin:8px 0 0">Sounds only, never the meaning. Each hint costs 15 points.</p>
		</div>
	{:else}
		<div class="panel accent pop">
			<div class="eyebrow">The word</div>
			<div class="word-big">{revealed}</div>
			<p class="muted small">Say it out loud once. Then use it in a sentence of your own: producing it is what makes it stick.</p>
			<form onsubmit={(e) => (e.preventDefault(), submitSentence())} class="answer">
				<input bind:this={sInput} bind:value={sentence} placeholder="Your sentence…" autocomplete="off" enterkeyhint="send" />
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
				<div class="word-big" style="margin-top:6px">{result.target}</div>
				<div class="muted small">{result.definition}</div>
			</div>
		</div>
		<div class="facts">
			<div><span class="tiny faint">Time</span><b class="num">{fmtMs(result.metrics.latencyMs)}</b></div>
			<div><span class="tiny faint">Hints</span><b class="num">{result.metrics.hints}</b></div>
			{#if result.rating}<div><span class="tiny faint">Rating</span><b class="num">{Math.round(result.rating.before)} → {Math.round(result.rating.after)}</b></div>{/if}
		</div>
		{#if result.metrics.selfResolvedTot}<p class="flash">You resolved a tip-of-the-tongue state on your own. Those tend not to come back.</p>{/if}
		{#if msg}<p class="small muted">{msg.text}</p>{/if}
		{#if result.addedToDeck}<p class="small muted">Added to your review deck, so it comes back spaced out.</p>{/if}
	</div>
	<button class="primary lg block" onclick={go}>{bench ? 'Back to the benchmark' : cross && step < ans.length - 1 ? `Now in ${NAMES[ans[step + 1]]}` : n < total ? 'Next word' : ds ? 'Back to today' : 'Done'} <ArrowRight size={18} /></button>
{/if}

<style>
	.prompt .definition { font-size: 1.35rem; }
	.cross { margin-bottom: 6px; }
	.earlier { margin: 2px 0 6px; }
	.answer { display: flex; gap: 10px; }
	.answer input { flex: 1; }
	.ladder { margin-top: 16px; }
	.rungs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
	@media (max-width: 560px) { .rungs { grid-template-columns: 1fr 1fr; } }
	.rung { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line-soft); min-height: 58px; }
	.rung.used { border-color: rgba(226, 184, 107, 0.4); background: var(--warm-soft); }
	.dot { width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; font-size: 0.72rem; font-weight: 700; background: var(--panel-3); color: var(--muted); flex: none; }
	.rung.used .dot { background: var(--warm); color: #2a1f08; }
	.hint { font-weight: 600; font-size: 0.92rem; margin-top: 2px; overflow-wrap: anywhere; }
	.result { margin-bottom: 14px; }
	.facts { display: flex; gap: 24px; margin: 14px 0 4px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
	.facts div { display: flex; flex-direction: column; }
</style>
