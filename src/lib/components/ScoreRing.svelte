<script lang="ts">
	// A 0-100 score as a ring. Colour carries the band, and the number is always printed.
	let { score, size = 92, label = '' }: { score: number | null; size?: number; label?: string } = $props();
	const r = 40;
	const c = 2 * Math.PI * r;
	const v = $derived(score == null ? 0 : Math.max(0, Math.min(100, score)));
	const color = $derived(score == null ? 'var(--faint)' : v >= 80 ? 'var(--good)' : v >= 50 ? 'var(--warm)' : 'var(--bad)');
</script>

<div class="ring" style="width:{size}px;height:{size}px">
	<svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
		<circle cx="50" cy="50" r={r} fill="none" stroke="var(--panel-3)" stroke-width="9" />
		<circle cx="50" cy="50" r={r} fill="none" stroke={color} stroke-width="9" stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - v / 100)} transform="rotate(-90 50 50)" style="transition: stroke-dashoffset 0.6s ease-out" />
	</svg>
	<div class="in"><b class="num">{score ?? '—'}</b>{#if label}<span>{label}</span>{/if}</div>
</div>

<style>
	.ring { position: relative; flex: none; }
	.in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
	.in b { font-size: 1.7rem; font-weight: 750; letter-spacing: -0.02em; line-height: 1; }
	.in span { font-size: 0.68rem; color: var(--muted); margin-top: 3px; font-weight: 600; letter-spacing: 0.05em; }
</style>
