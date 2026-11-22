<script lang="ts">
	import { page } from '$app/state';
	import { tick, onMount, onDestroy } from 'svelte';
	import { post } from '$lib/api';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import ScoreRing from '$lib/components/ScoreRing.svelte';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Play from '@lucide/svelte/icons/play';

	const lang = page.url.searchParams.get('lang') ?? 'en';
	const ds = page.url.searchParams.get('ds');
	const bench = page.url.searchParams.get('bench');
	let cur = $state<any>(null);
	let running = $state(false);
	let endsAt = 0;
	let startedAt = 0;
	let left = $state(60);
	let words = $state<string[]>([]);
	let w = $state('');
	let result = $state<any>(null);
	let busy = $state(false);
	let err = $state('');
	let skipped: string[] = [];
	let input: HTMLInputElement | undefined = $state();
	let timer: ReturnType<typeof setInterval> | undefined;

	async function load(kind?: string) {
		err = '';
		result = null;
		words = [];
		try {
			cur = await post('/api/a2', { action: 'start', lang, ds, bench, kind, exclude: skipped });
			left = cur.seconds;
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
	}
	onMount(() => load());
	onDestroy(() => clearInterval(timer));

	async function switchKind() {
		if (!cur) return;
		skipped.push(cur.itemId);
		const kind = cur.kind === 'semantic' ? 'letter' : 'semantic';
		await post('/api/a2', { action: 'skip', attemptId: cur.attemptId });
		await load(kind);
	}
	async function another() {
		if (cur && !result) {
			skipped.push(cur.itemId);
			await post('/api/a2', { action: 'skip', attemptId: cur.attemptId });
		}
		await load(cur?.kind);
	}
	async function go() {
		running = true;
		startedAt = Date.now();
		endsAt = startedAt + cur.seconds * 1000;
		timer = setInterval(() => {
			left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
			if (left <= 0) finish();
		}, 200);
		await tick();
		input?.focus();
	}
	function add() {
		const v = w.trim();
		if (v) words = [...words, v];
		w = '';
	}
	async function finish() {
		if (!running) return;
		running = false;
		clearInterval(timer);
		if (w.trim()) add();
		busy = true;
		try {
			result = await post('/api/a2', { action: 'submit', attemptId: cur.attemptId, words, elapsedMs: Date.now() - startedAt });
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
		busy = false;
	}
	const pct = $derived(cur ? (100 * left) / cur.seconds : 100);
</script>

<DrillHeader code="A2" {lang} guide={!bench && !running} />
{#if err}<p class="flash bad">{err}</p>{/if}

{#if cur && !result}
	<div class="panel accent prompt">
		<div class="eyebrow">{cur.kind === 'semantic' ? 'Name things in this category' : 'Words starting with'}</div>
		<div class="big">{cur.kind === 'letter' ? cur.prompt.toUpperCase() : cur.prompt}</div>
		{#if !running && !busy}
			<button class="primary lg block" onclick={go}><Play size={18} /> Start 60 seconds</button>
			{#if !bench}
				<div class="row" style="justify-content:center;margin-top:8px">
					<button class="ghost sm" onclick={another}><Shuffle size={14} /> Another {cur.kind === 'semantic' ? 'category' : 'letter'}</button>
					<button class="ghost sm" onclick={switchKind}>Switch to {cur.kind === 'semantic' ? 'a letter' : 'a category'}</button>
				</div>
			{/if}
		{:else if running}
			<div class="clock">
				<span class="num secs" class:low={left <= 10}>{left}</span>
				<div class="bar" style="flex:1"><i style="width:{pct}%;{left <= 10 ? 'background:var(--warm)' : ''}"></i></div>
				<span class="muted small num">{words.length} words</span>
			</div>
			<form onsubmit={(e) => (e.preventDefault(), add())}>
				<input bind:this={input} class="big-input" bind:value={w} placeholder="Type a word, press Enter" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" />
			</form>
			<div class="words">{#each words as x}<span class="wchip pop">{x}</span>{/each}</div>
			<div class="row" style="margin-top:10px"><span class="spacer"></span><button class="ghost sm" onclick={finish}>Stop early</button></div>
		{:else}
			<p class="muted">Scoring…</p>
		{/if}
	</div>
{/if}

{#if result}
	<div class="panel pop">
		<div class="row nowrap">
			{#if result.score != null}<ScoreRing score={result.score} label="FL" />{/if}
			<div>
				<div class="eyebrow">{result.kind === 'letter' ? `Letter ${String(result.prompt).toUpperCase()}` : result.prompt}</div>
				<div class="word-big num">{result.metrics.valid} <span class="muted" style="font-size:1rem;font-weight:500">{result.validated ? 'valid words' : 'words, not checked'}</span></div>
				{#if result.baselineMean != null}<div class="small muted">Your recent average: {result.baselineMean} over {result.baselineN} sprints</div>{/if}
			</div>
		</div>
		<div class="words" style="margin-top:14px">
			{#each result.metrics.validWords as x}<span class="wchip">{x}</span>{/each}
			{#each result.metrics.intrusionWords as x}<span class="wchip off" title="not counted">{x}</span>{/each}
		</div>
		<div class="facts">
			<div><span class="tiny faint">Repeated</span><b class="num">{result.metrics.repetitions}</b></div>
			<div><span class="tiny faint">Off-topic</span><b class="num">{result.metrics.intrusions}</b></div>
			<div><span class="tiny faint">Clusters</span><b class="num">{result.metrics.clusters}</b></div>
			<div><span class="tiny faint">Switches</span><b class="num">{result.metrics.switches}</b></div>
		</div>
		{#if !result.validated}<p class="tiny faint">These words could not be checked because the model or word list is unavailable. This round is practice only and does not affect your score, rating or benchmark.</p>
		{:else}<p class="tiny faint">{result.baselineN < 3 ? 'Until you have three earlier checked sprints of this kind and language, 25 valid words scores 100.' : 'Your recent average scores 50; each standard deviation above or below moves it 20 points.'}</p>{/if}
	</div>
	<div class="row">
		{#if bench}<button class="primary lg block" onclick={() => (location.href = '/benchmark/' + bench)}>Back to the benchmark</button>
		{:else}<button class="primary lg" style="flex:1" onclick={() => load(result.kind)}>Another sprint</button><a class="btn lg" href={ds ? '/' : '/drills'}>Done</a>{/if}
	</div>
{/if}

<style>
	.prompt { text-align: center; }
	.big { font-size: 2rem; font-weight: 720; letter-spacing: -0.02em; margin: 6px 0 16px; }
	.big::first-letter { text-transform: uppercase; }
	.clock { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
	.secs { font-size: 1.6rem; font-weight: 750; width: 2.2ch; text-align: right; }
	.secs.low { color: var(--warm); }
	.words { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; justify-content: flex-start; text-align: left; }
	.wchip { padding: 4px 10px; border-radius: 99px; background: var(--panel-3); font-size: 0.88rem; }
	.wchip.off { background: var(--bad-soft); color: var(--bad); text-decoration: line-through; }
	.facts { display: flex; gap: 22px; margin: 14px 0 4px; padding-top: 12px; border-top: 1px solid var(--line-soft); flex-wrap: wrap; }
	.facts div { display: flex; flex-direction: column; }
</style>
