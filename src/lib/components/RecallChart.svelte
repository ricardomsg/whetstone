<script lang="ts">
	let { points }: { points: { id: string; delayMs: number; score: number; lang: string }[] } = $props();
	const maxDays = $derived(Math.max(1, ...points.map((p) => p.delayMs / 86400_000)));
	const x = (ms: number) => 45 + (ms / 86400_000 / maxDays) * 480;
	const y = (score: number) => 175 - score * 1.4;
</script>
<svg viewBox="0 0 560 220" role="img" aria-label="Conversation recall scores versus days since capture" style="width:100%;height:auto">
	{#each [0, 50, 100] as score}<line x1="45" y1={y(score)} x2="525" y2={y(score)} stroke="var(--line)" /><text x="35" y={y(score) + 4} text-anchor="end" fill="var(--muted)" font-size="11">{score}</text>{/each}
	{#each [0, maxDays / 2, maxDays] as day}<text x={x(day * 86400_000)} y="193" text-anchor="middle" fill="var(--muted)" font-size="11">{day.toFixed(1)}</text>{/each}
	<text x="285" y="215" text-anchor="middle" fill="var(--muted)" font-size="12">Days since recap capture</text>
	{#each points as point}<a href="/history/{point.id}" aria-label="{point.score} percent after {(point.delayMs / 86400_000).toFixed(1)} days, {point.lang}"><circle cx={x(point.delayMs)} cy={y(point.score)} r="5" fill={point.lang === 'pt-PT' ? 'var(--warm)' : 'var(--accent)'} opacity="0.85"><title>{point.score}% after {(point.delayMs / 86400_000).toFixed(1)} days · {point.lang}</title></circle></a>{/each}
</svg>
<p class="tiny muted">Green: English · amber: Portuguese. Each point opens its attempt.</p>
