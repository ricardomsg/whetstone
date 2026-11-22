<script lang="ts">
	import { EXERCISES, langLabel } from '$lib/content/exercises';
	import Ico from '$lib/components/Ico.svelte';
	import Check from '@lucide/svelte/icons/check';
	let { data } = $props();
	const done = (p: any) => Math.min(p.count, data.progress[`${p.exercise}:${p.lang}`] ?? 0);
</script>

<h1>Today's session</h1>
<p class="muted">Built from what is due, where you struggle, and what you have not practised lately.</p>
<form method="POST" class="panel flat tight">
	<div class="row">
		<div class="chip-row">{#each [5, 15, 30] as m}<label class="choice"><input type="radio" name="minutes" value={m} checked={data.plan.minutes === m} /> {m} min</label>{/each}</div>
		<div class="chip-row">{#each [['en', 'English'], ['pt-PT', 'Português'], ['mixed', 'Both']] as [v, l]}<label class="choice"><input type="radio" name="lang" value={v} checked={data.plan.lang === v} /> {l}</label>{/each}</div>
		<span class="spacer"></span>
		<button type="submit">Rebuild the plan</button>
	</div>
</form>
{#each data.plan.plan as p, i}
	{@const m = EXERCISES[p.exercise]}
	{@const d = done(p)}
	<div class="panel step" class:done={d >= p.count}>
		<div class="row nowrap">
			<Ico icon={m.icon} skill={m.skill} size={42} />
			<div style="flex:1;min-width:0">
				<div class="row nowrap" style="gap:8px"><b>{i + 1}. {m.title}</b><span class="tag">{langLabel(p.lang)}</span><span class="faint small num">{d}/{p.count}</span></div>
				<div class="small muted">{p.reason}</div>
			</div>
			{#if d >= p.count}<span class="ok"><Check size={16} strokeWidth={3} /></span>{:else}<a class="btn primary" href="{p.href}&ds={data.plan.id}&n={Math.max(1, p.count - d)}">{d ? 'Continue' : 'Start'}</a>{/if}
		</div>
	</div>
{/each}

<style>
	.step.done { opacity: 0.6; }
	.ok { width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); flex: none; }
</style>
