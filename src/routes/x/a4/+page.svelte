<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { post } from '$lib/api';
	import Feedback from '$lib/components/Feedback.svelte';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import BookMarked from '@lucide/svelte/icons/book-marked';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	const lang = page.url.searchParams.get('lang') ?? 'en';
	const ds = page.url.searchParams.get('ds');
	const bench = page.url.searchParams.get('bench');
	let cur = $state<any>(null);
	let alts = $state<string[]>(['', '', '', '', '']);
	let pick = $state('');
	let why = $state('');
	let result = $state<any>(null);
	let busy = $state(false);
	let err = $state('');

	async function load() {
		err = '';
		result = null;
		alts = ['', '', '', '', ''];
		pick = '';
		why = '';
		try {
			cur = await post('/api/a4', { action: 'start', lang, ds, bench });
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
	}
	onMount(load);

	function parts(s: string, t: string) {
		const i = s.toLowerCase().indexOf(t.toLowerCase());
		return i < 0 ? [s, '', ''] : [s.slice(0, i), s.slice(i, i + t.length), s.slice(i + t.length)];
	}
	const filled = $derived(alts.map((a) => a.trim()).filter(Boolean));
	$effect(() => {
		if (pick && !filled.includes(pick)) pick = '';
	});
	async function submit() {
		busy = true;
		try {
			result = await post('/api/a4', { action: 'submit', attemptId: cur.attemptId, alternatives: alts, pick, justification: why });
		} catch (e) {
			err = String(e).replace('Error: ', '');
		}
		busy = false;
	}
</script>

<DrillHeader code="A4" {lang} guide={!bench} />
{#if err}<p class="flash bad">{err}</p>{/if}

{#if cur}
	{@const [a, b, c] = parts(cur.sentence, cur.target)}
	<div class="panel">
		<div class="row"><span class="tag">{cur.register?.replace(/-/g, ' ')}</span></div>
		<p class="definition">{a}<mark>{b}</mark>{c}</p>
	</div>
	{#if !result}
		<label for="a0">Up to five words that could replace “{cur.target}” here</label>
		<div class="alts">{#each alts as _, i}<input id={'a' + i} bind:value={alts[i]} placeholder={`${i + 1}`} autocomplete="off" autocapitalize="off" />{/each}</div>
		{#if filled.length}
			<div class="lbl" id="pick-l">Which is the most precise for this context? Tap it.</div>
			<div class="chip-row" role="radiogroup" aria-labelledby="pick-l">{#each filled as f}<button type="button" class="chip" role="radio" aria-checked={pick === f} class:on={pick === f} onclick={() => (pick = f)}>{f}</button>{/each}</div>
		{/if}
		<label for="why">Why, in one line</label>
		<input id="why" bind:value={why} placeholder="What it says that the runner-up does not" />
		<button class="primary lg block" style="margin-top:14px" onclick={submit} disabled={busy || filled.length < 2 || !pick || !why.trim()}>{busy ? 'Grading… about 10 seconds' : 'Submit'}</button>
		{#if filled.length < 2}<p class="tiny faint" style="text-align:center">At least two alternatives, a pick and a reason.</p>{/if}
	{:else}
		<Feedback attemptId={result.attemptId} score={result.score} feedback={result.judge ? { scores: result.judge.scores, evidence: result.judge.evidence, tips: result.judge.tips, rubric: result.judge.rubricId } : { note: 'Not graded: the judge is off or unavailable.' }} dim="PR" />
		{#if result.objective.duplicates || result.objective.sameAsFlat}<p class="small muted">Penalty: {result.objective.duplicates} repeated form{result.objective.duplicates === 1 ? '' : 's'}, {result.objective.sameAsFlat} same as “{cur.target}”.</p>{/if}
		{#if result.reference}
			<div class="panel pop">
				<div class="row"><BookMarked size={18} color="var(--c-PR)" /><b>Alternatives to learn from</b></div>
				<div class="refs">
					{#each result.reference.alternatives as r}
						<div class="ref" class:no={!r.fits}>
							<span class="mk">{#if r.fits}<Check size={14} />{:else}<X size={14} />{/if}</span>
							<div><b>{r.word}</b>{#if filled.map((f) => f.toLowerCase()).includes(r.word.toLowerCase())} <span class="tag good">yours</span>{/if}<div class="small muted">{r.nuance}</div></div>
						</div>
					{/each}
				</div>
				<div class="best"><div class="eyebrow">Best here</div><b>{result.reference.best.word}</b> <span class="muted">— {result.reference.best.why}</span></div>
			</div>
		{/if}
		<div class="row">
			{#if bench}<button class="primary lg block" onclick={() => (location.href = '/benchmark/' + bench)}>Back to the benchmark</button>
			{:else}<button class="primary lg" style="flex:1" onclick={load}>Another sentence</button><a class="btn lg" href={ds ? '/' : '/drills'}>Done</a>{/if}
		</div>
	{/if}
{/if}

<style>
	.lbl { margin: 12px 0 6px; color: var(--muted); font-size: 0.88rem; font-weight: 500; }
	mark { background: var(--warm-soft); color: var(--warm); padding: 0 4px; border-radius: 5px; border-bottom: 2px solid var(--warm); }
	.alts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
	@media (max-width: 640px) { .alts { grid-template-columns: 1fr 1fr; } }
	.refs { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
	.ref { display: flex; gap: 10px; align-items: flex-start; }
	.mk { width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; flex: none; background: var(--accent-soft); color: var(--good); margin-top: 1px; }
	.ref.no .mk { background: var(--bad-soft); color: var(--bad); }
	.ref.no b { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(232, 131, 131, 0.6); }
	.best { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: var(--panel-2); }
</style>
