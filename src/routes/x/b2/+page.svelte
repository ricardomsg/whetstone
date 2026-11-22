<script lang="ts">
	import { page } from '$app/state';
	import { tick, onMount } from 'svelte';
	import { post } from '$lib/api';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	const lang = page.url.searchParams.get('lang') ?? undefined;
	const ds = page.url.searchParams.get('ds');
	let cur = $state<any>(null);
	let answer = $state('');
	let hints = $state<any[]>([]);
	let res = $state<any>(null);
	let retry = $state(false);
	let err = $state('');
	let input: HTMLInputElement | undefined = $state();
	const G = [
		[1, 'Again'],
		[2, 'Hard'],
		[3, 'Good'],
		[4, 'Easy']
	] as const;

	async function next() {
		err = '';
		res = null;
		answer = '';
		hints = [];
		retry = false;
		try {
			cur = await post('/api/b2', { action: 'next', lang, ds });
			await tick();
			input?.focus();
		} catch (e) {
			err = String(e);
		}
	}
	onMount(() => next());

	async function submit(giveUp = false) {
		const r = await post('/api/b2', { action: 'answer', attemptId: cur.attemptId, text: giveUp ? null : answer });
		if (r.retry) {
			retry = true;
			answer = '';
			input?.focus();
		} else res = r;
	}
	async function hint() {
		const r = await post('/api/b2', { action: 'hint', attemptId: cur.attemptId });
		if (r.reveal) submit(true);
		else hints = [...hints, r];
		input?.focus();
	}
	async function grade(g: number) {
		await post('/api/b2', { action: 'grade', attemptId: cur.attemptId, grade: g });
		next();
	}
	function onkey(e: KeyboardEvent) {
		if (res && ['1', '2', '3', '4'].includes(e.key)) grade(Number(e.key));
		if (res && e.key === 'Enter') grade(res.computedGrade);
	}
</script>

<svelte:window onkeydown={onkey} />
<DrillHeader code="B2" lang={cur?.lang ?? ''} />
<p class="muted small">Follow-up practice for words saved from Definition → word, your <a href="/words">inbox</a> and your <a href="/tot">tip-of-the-tongue log</a>. Recall each word when its card is due.</p>
{#if err}<p class="flash bad">{err}</p>{/if}

{#if cur?.capped}
	<p class="flash">Daily cap reached ({cur.cap} reviews). The rest waits for tomorrow; the cap is in Settings.</p>
	<a class="btn" href={ds ? '/today' : '/'}>Done</a>
{:else if cur?.empty}
	<p class="flash">Nothing due. {cur.done} reviewed today.</p>
	<a class="btn" href={ds ? '/today' : '/'}>Done</a>
{:else if cur}
	<div class="row small muted"><span class="num">{cur.done} of {cur.cap} today</span>{#if cur.sticky}<span class="tag bad">sticky word</span>{/if}{#if cur.tags.includes('tot_item')}<span class="tag warn">was on the tip of your tongue</span>{/if}</div>
	<div class="panel card">
		<div class="eyebrow">{cur.mode === 'gap' ? 'Fill the gap' : 'Produce the word'}{cur.pos ? ` · ${cur.pos}` : ''}</div>
		<p class="definition">{cur.prompt}</p>
		{#if cur.mode === 'gap'}<p class="muted small">{cur.definition}</p>{/if}
	</div>
	{#if !res}
		<form class="answer" onsubmit={(e) => (e.preventDefault(), submit())}><input bind:this={input} class="big-input" bind:value={answer} placeholder="Type the word…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" /><button class="primary lg" type="submit" disabled={!answer.trim()} aria-label="Check"><ArrowRight size={20} /></button></form>
		{#if retry}<p class="flash warn">Not it. Try again, take a hint, or reveal.</p>{/if}
		<div class="row" style="margin-top:8px">
			<button onclick={hint}>{hints.length >= 4 ? 'Reveal' : `Hint ${hints.length + 1}`}</button>
			<span class="spacer"></span>
			<button class="ghost" onclick={() => submit(true)}>Show the word</button>
		</div>
		{#if hints.length}<ol class="hints">{#each hints as h}<li><span class="muted">{h.label}:</span> {h.text}</li>{/each}</ol>{/if}
	{:else}
		<div class="panel pop {res.correct ? 'accent' : 'bad'}">
			<span class="tag {res.correct ? 'good' : 'bad'}">{res.correct ? 'Produced' : 'Not produced'}</span>
			<div class="word-big" style="margin:6px 0">{res.target}</div>
			{#if res.spelling}<p class="muted small">Spelling: {res.spelling}</p>{/if}
			<p class="muted small">Suggested grade <b style="color:var(--text)">{res.gradeName}</b>: {res.why}. Press Enter to accept, or choose another.</p>
			<div class="grades">{#each G as [g, l]}<button class:primary={g === res.computedGrade} onclick={() => grade(g)}>{l} <span class="kbd">{g}</span></button>{/each}</div>
		</div>
	{/if}
{/if}

<style>
	.card .definition { font-size: 1.35rem; }
	.answer { display: flex; gap: 10px; }
	.answer input { flex: 1; }
	.grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
	@media (max-width: 480px) { .grades { grid-template-columns: 1fr 1fr; } }
</style>
