<script lang="ts">
	import { post } from '$lib/api';
	import { onMount } from 'svelte';
	let { data } = $props();
	const t = data.t;
	let ready = $state(false);
	let failed = $state(false);
	let hints = $state<any[]>([]);
	let candidates = $state<any[] | null>(null);
	let guess = $state('');
	let done = $state(t.word ? t.word : '');
	let sentenceNeeded = $state(false);

	onMount(() => {
		if (!t.word)
			post(`/api/tot/${t.id}`, { action: 'suggest' })
				.then((r) => (r.ready ? (ready = true) : (failed = true)))
				.catch(() => (failed = true));
	});

	async function hint() {
		const r = await post(`/api/tot/${t.id}`, { action: 'hint', level: hints.length + 1 });
		if (r.candidates) candidates = r.candidates;
		else hints = [...hints, r];
	}
	async function resolve(word: string, how: string) {
		await post(`/api/tot/${t.id}`, { action: 'resolve', word, how });
		done = word;
		sentenceNeeded = how !== 'self';
	}
</script>

<h1>Find the word</h1>
<div class="panel"><p class="definition">{t.meaning}</p>{#if t.interlopers}<p class="muted small">Came to mind: {t.interlopers}</p>{/if}</div>

{#if done}
	<p class="flash">Saved: <b>{done}</b>. It is now a practice item and a review card.</p>
	{#if sentenceNeeded}<p class="muted">Say it out loud, then use it in a sentence the next time it comes up in review.</p>{/if}
	<div class="row"><a class="btn primary" href="/tot">Back to the log</a><a class="btn" href="/">Home</a></div>
{:else}
	<p class="muted">Try it yourself first. Hints give sounds of the likeliest word, one at a time; suggestions come last.</p>
	<form onsubmit={(e) => (e.preventDefault(), guess.trim() && resolve(guess.trim(), hints.length ? 'hinted' : 'self'))}>
		<label for="g">It is…</label>
		<input id="g" class="big-input" bind:value={guess} autocomplete="off" autocapitalize="off" />
		<div class="row" style="margin-top:8px"><button class="primary" type="submit" disabled={!guess.trim()}>That's it</button></div>
	</form>
	<div class="panel">
		<div class="row"><b>Hints</b><span class="spacer"></span><button onclick={hint} disabled={!ready || !!candidates}>{hints.length >= 4 ? 'Show suggestions' : 'Next hint'}</button></div>
		{#if failed}<p class="muted small">Suggestions are unavailable (the model is off or failed). Save the word when you find it.</p>{:else if !ready}<p class="muted small">Preparing…</p>{/if}
		{#if hints.length}<ol class="hints">{#each hints as h}<li><span class="muted">{h.label}:</span> {h.text}</li>{/each}</ol>{/if}
		{#if candidates}
			<p class="muted small">Suggestions, likeliest first. Pick the one you meant.</p>
			<div class="row">{#each candidates as c}<button onclick={() => resolve(c.word, 'looked_up')}>{c.word}</button>{/each}</div>
		{/if}
	</div>
{/if}
