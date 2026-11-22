<script lang="ts">
	import { onMount } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import { GUIDANCE } from '$lib/content/guidance';
	// Hidden behind an info button; opens by itself only the first two times an exercise is shown.
	// `trigger={false}` when the caller (DrillHeader) renders its own button.
	let { code, open = $bindable(false), trigger = true }: { code: string; open?: boolean; trigger?: boolean } = $props();
	const g = $derived(GUIDANCE[code]);
	onMount(() => {
		const k = `ws-guidance-${code}`;
		const n = Number(localStorage.getItem(k) ?? '0');
		open = n < 2;
		localStorage.setItem(k, String(n + 1));
	});
</script>

{#if g}
	{#if trigger && !open}
		<button class="ghost sm guidance-btn" onclick={() => (open = true)}><Info size={15} /> Why this works</button>
	{/if}
	{#if open}
		<div class="guidance">
			<div class="row nowrap"><Info size={16} /><b class="small">Why this works</b><span class="spacer"></span><button class="ghost sm" aria-label="Close" onclick={() => (open = false)}><X size={15} /></button></div>
			<p>{g.why}</p>
			<p class="muted">{g.how}</p>
		</div>
	{/if}
{/if}
