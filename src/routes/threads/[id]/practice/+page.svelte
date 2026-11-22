<script lang="ts">
	import ThreadDrill from '$lib/components/ThreadDrill.svelte';
	let { data } = $props();
</script>
{#key `${data.threadId}:${data.exercise}`}<ThreadDrill setup={data} />{/key}
