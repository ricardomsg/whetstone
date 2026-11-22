<script lang="ts">
	import { onMount } from 'svelte';
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import Play from '@lucide/svelte/icons/play';

	// Definition → word with chosen languages: the definition in one language, the word in one or both,
	// asked in the order they were picked. The last choice is remembered on this device.
	const NAMES: Record<string, string> = { en: 'English', 'pt-PT': 'Português' };
	const KEY = 'ws.a1.langs';
	let def = $state<'en' | 'pt-PT'>('en');
	let ans = $state<string[]>(['pt-PT']);

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
			if (saved?.def && Array.isArray(saved.ans) && saved.ans.length) ((def = saved.def), (ans = saved.ans));
		} catch {}
	});

	function toggle(l: string) {
		ans = ans.includes(l) ? ans.filter((x) => x !== l) : [...ans, l];
	}
	function start() {
		localStorage.setItem(KEY, JSON.stringify({ def, ans }));
		location.href = `/x/a1?def=${def}&ans=${ans.join(',')}`;
	}
</script>

<DrillHeader code="A1" guide={false} />
<h2 style="margin-top:4px">Choose the languages</h2>
<p class="muted small">Read the definition in one language and find the word in one or both. With both, you answer in the order you pick them.</p>

<section class="panel">
	<div class="eyebrow">Read the definition in</div>
	<div class="row choices">
		{#each ['en', 'pt-PT'] as l}<button class:on={def === l} aria-pressed={def === l} onclick={() => (def = l as any)}>{NAMES[l]}</button>{/each}
	</div>
	<div class="eyebrow" style="margin-top:16px">Find the word in</div>
	<div class="row choices">
		{#each ['en', 'pt-PT'] as l}
			<button class:on={ans.includes(l)} aria-pressed={ans.includes(l)} onclick={() => toggle(l)}>
				{#if ans.includes(l)}<span class="order num">{ans.indexOf(l) + 1}</span>{/if}{NAMES[l]}
			</button>
		{/each}
	</div>
	<p class="small muted summary">
		{#if ans.length}You read the definition in {NAMES[def]} and answer in {ans.map((l) => NAMES[l]).join(', then ')}.{:else}Pick at least one language to answer in.{/if}
	</p>
</section>
<button class="primary lg block" disabled={!ans.length} onclick={start}><Play size={18} /> Start</button>

<style>
	.choices { gap: 10px; margin-top: 8px; }
	.choices button { flex: 1; justify-content: center; }
	.choices button.on { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }
	.order { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 99px; background: var(--accent); color: #0d1a14; font-size: 0.72rem; font-weight: 700; margin-right: 8px; }
	.summary { margin: 14px 0 0; }
	section { margin-bottom: 16px; }
</style>
