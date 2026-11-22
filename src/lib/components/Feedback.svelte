<script lang="ts">
	import { post } from '$lib/api';
	import ScoreRing from './ScoreRing.svelte';
	import Flag from '@lucide/svelte/icons/flag';
	// A judged result: the score, each criterion as a 5-step bar with its evidence, the tips, and the dispute form.
	let { attemptId, score, feedback, dim, details = true }: { attemptId: string; score: number | null; feedback: any; dim: string; details?: boolean } = $props();
	let fb = $state<any>(null);
	let sc = $state<number | null>(null);
	$effect(() => {
		fb = feedback;
		sc = score;
	});
	let editing = $state(false);
	let crit = $state('_score');
	let val = $state(3);
	let reason = $state('');
	let msg = $state('');
	async function save() {
		try {
			const r = await post(`/api/attempts/${attemptId}/override`, { criterion: crit, score: Number(val), reason });
			fb = r.feedback;
			sc = r.scores?.[dim] ?? sc;
			editing = false;
			msg = 'Override saved. It is logged and shown on the Progress page.';
		} catch (e) {
			msg = String(e);
		}
	}
	const label = (k: string) => k.replace(/_/g, ' ');
</script>

<div class="panel pop">
	<div class="row nowrap" style="align-items:flex-start">
		<ScoreRing score={sc} label={dim} />
		<div class="spacer">
			{#if fb?.scores}
				{#each Object.entries(fb.scores) as [k, v]}
					<div class="crit">
						<div class="row nowrap"><span class="small" style="text-transform:capitalize">{label(k)}</span><span class="spacer"></span><span class="tiny faint num">{v}/5</span></div>
						<div class="seg">{#each [1, 2, 3, 4, 5] as s}<i class:on={s <= Number(v)} class:lo={Number(v) <= 2} class:mid={Number(v) === 3}></i>{/each}</div>
						{#if fb.evidence?.[k]}<div class="tiny muted ev">{fb.evidence[k]}</div>{/if}
					</div>
				{/each}
			{:else if fb?.note}
				<p class="muted">{fb.note}</p>
			{/if}
		</div>
	</div>
	{#if fb?.tips?.length}
		<div class="tips">
			<div class="eyebrow">What to do next time</div>
			{#each fb.tips as t}<p>{t}</p>{/each}
		</div>
	{/if}
	<div class="row" style="margin-top:8px">
		{#if attemptId && details}<a class="small" href="/history/{attemptId}">Details</a>{/if}
		<span class="spacer"></span>
		<button class="ghost sm" onclick={() => (editing = !editing)}><Flag size={14} /> Dispute</button>
	</div>
	{#if editing}
		<div class="panel flat tight">
			<label for="ov-c">What to change</label>
			<select id="ov-c" bind:value={crit}>
				<option value="_score">Overall score (0–100)</option>
				{#each Object.keys(fb?.scores ?? {}) as k}<option value={k}>{label(k)} (1–5)</option>{/each}
			</select>
			<label for="ov-v">New value</label>
			<input id="ov-v" type="number" min={crit === '_score' ? 0 : 1} max={crit === '_score' ? 100 : 5} bind:value={val} />
			<label for="ov-r">Why</label>
			<input id="ov-r" bind:value={reason} placeholder="What the judge got wrong" />
			<div class="row" style="margin-top:10px"><button class="primary" onclick={save}>Save override</button></div>
		</div>
	{/if}
	{#if msg}<p class="muted small">{msg}</p>{/if}
</div>

<style>
	.crit { margin: 0 0 10px; }
	.seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; margin: 4px 0 2px; }
	.seg i { height: 6px; border-radius: 3px; background: var(--panel-3); }
	.seg i.on { background: var(--good); }
	.seg i.on.mid { background: var(--warm); }
	.seg i.on.lo { background: var(--bad); }
	.ev { line-height: 1.4; }
	.tips { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); border: 1px solid rgba(124, 196, 164, 0.25); }
	.tips p { margin: 6px 0 0; }
</style>
