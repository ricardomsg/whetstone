<script lang="ts">
	import type { Component } from 'svelte';
	// Icon inside a tinted rounded square; the tint follows the skill colour.
	let { icon: I, skill = '', size = 38 }: { icon: Component<any>; skill?: string; size?: number } = $props();
</script>

<span class="ico-bubble" style="width:{size}px;height:{size}px;{skill ? `color:var(--c-${skill});background:color-mix(in srgb, var(--c-${skill}) 14%, transparent)` : ''}">
	<I size={Math.round(size * 0.5)} strokeWidth={2} />
</span>
