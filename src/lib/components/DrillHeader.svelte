<script lang="ts">
	import { EXERCISES, langLabel } from '$lib/content/exercises';
	import { GUIDANCE } from '$lib/content/guidance';
	import Info from '@lucide/svelte/icons/info';
	import Ico from './Ico.svelte';
	import Guidance from './Guidance.svelte';
	let { code, n = 0, total = 0, lang = '', done = 0, guide = true }: { code: string; n?: number; total?: number; lang?: string; done?: number; guide?: boolean } = $props();
	const m = $derived(EXERCISES[code]);
	let open = $state(false);
</script>

<div class="dh" class:game={m.kind === 'game'} style:--game-colour={m.kind === 'game' ? m.colour : undefined}>
	{#if m.kind === 'game'}
		<img class="game-art" src={m.illustration} alt="" width="80" height="64" />
	{:else}
		<Ico icon={m.icon} skill={m.skill} size={44} />
	{/if}
	<div class="t">
		<h1>{m.title}</h1>
		{#if m.kind === 'game'}<p class="small pitch">{m.short}</p>{/if}
		<div class="muted small">{[m.skillName, langLabel(lang)].filter(Boolean).join(' · ')}</div>
	</div>
	{#if total > 1}
		<div class="prog">
			<div class="dots">{#each Array(total) as _, i}<i class:done={i < done} class:cur={i === n - 1 && i >= done}></i>{/each}</div>
			<span class="faint tiny num">{Math.min(n, total)} of {total}</span>
		</div>
	{/if}
	{#if guide && GUIDANCE[code]}
		<button class="ghost sm info" class:on={open} aria-label="Why this works" aria-expanded={open} onclick={() => (open = !open)}><Info size={18} /></button>
	{/if}
</div>
{#if guide}<Guidance {code} bind:open trigger={false} />{/if}

<style>
	.dh { display: flex; align-items: center; gap: 14px; margin: 4px 0 8px; }
	.t { flex: 1; min-width: 0; }
	.t h1 { margin: 0; font-size: 1.4rem; }
	.info { padding: 6px 8px; }
	.info.on { color: var(--accent); }
	.game { border-bottom: 1px solid color-mix(in srgb, var(--game-colour) 30%, transparent); padding-bottom: 14px; }
	.game h1 { color: var(--game-colour); }
	.game-art { flex: none; object-fit: contain; }
	.pitch { margin: 4px 0; }
	@media (max-width: 480px) {
		.dh.game { flex-wrap: wrap; gap: 10px; }
		.game-art { width: 52px; height: 48px; }
		.game .t { flex-basis: calc(100% - 114px); }
		.game .prog { order: 1; width: 100%; flex-direction: row; align-items: center; }
	}
	.prog { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
</style>
