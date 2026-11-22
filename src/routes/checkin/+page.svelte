<script lang="ts">
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	let { data } = $props();
	const c = data.c ?? ({} as any);
	const scale = [1, 2, 3, 4, 5];
</script>

<DrillHeader code="F1" />
<form method="POST">
	<label for="sh">Sleep last night (hours)</label>
	<input id="sh" name="sleepHours" type="number" step="0.5" min="0" max="14" value={c.sleepHours ?? ''} inputmode="decimal" />
	{#each [['sleepQuality', 'Sleep quality'], ['energy', 'Energy'], ['stress', 'Stress']] as [k, l]}
		<fieldset class="scale">
			<legend>{l} <span class="faint">1 low · 5 high</span></legend>
			<div class="opts">{#each scale as v}<label class="choice"><input type="radio" name={k} value={v} checked={c[k] === v} /> {v}</label>{/each}</div>
		</fieldset>
	{/each}
	<label for="ex">Exercise yesterday</label>
	<select id="ex" name="exercise">{#each ['', 'none', 'light', 'aerobic', 'sport'] as v}<option value={v} selected={c.exercise === v}>{v || '—'}</option>{/each}</select>
	<label for="ml">Main language today</label>
	<select id="ml" name="mainLanguage">{#each [['', '—'], ['en', 'English'], ['pt-PT', 'Português'], ['mixed', 'Mixed']] as [v, l]}<option value={v} selected={c.mainLanguage === v}>{l}</option>{/each}</select>
	<button class="primary lg block" style="margin-top:18px" type="submit">Save</button>
</form>

<style>
	.scale { border: 0; padding: 0; margin: 16px 0 0; }
	.scale legend { color: var(--muted); font-size: 0.88rem; font-weight: 500; margin-bottom: 6px; padding: 0; }
	.opts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
	.opts .choice { justify-content: center; border-radius: 12px; min-height: 46px; font-weight: 600; }
</style>
