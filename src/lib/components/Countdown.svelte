<script lang="ts">
	import { onDestroy } from 'svelte';
	// Visible timer. `endsAt` is an epoch ms; calls `onend` once when it passes.
	let { endsAt, onend, label = '' }: { endsAt: number; onend?: () => void; label?: string } = $props();
	let now = $state(Date.now());
	let fired = false;
	const t = setInterval(() => {
		now = Date.now();
		if (!fired && now >= endsAt) {
			fired = true;
			onend?.();
		}
	}, 200);
	onDestroy(() => clearInterval(t));
	const left = $derived(Math.max(0, Math.ceil((endsAt - now) / 1000)));
</script>

<span class="tag {left <= 10 ? 'warn' : ''}" aria-live="polite">{label}{left} s</span>
