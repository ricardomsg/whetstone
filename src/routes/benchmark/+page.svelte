<script lang="ts">
	import Guidance from '$lib/components/Guidance.svelte';
	let { data } = $props();
</script>

<h1>Benchmark</h1>
<Guidance code="BENCH" />
<form method="POST" class="row">
	<button class="primary" name="lang" value="en" disabled={!data.sets.en}>Start in English</button>
	<button name="lang" value="pt-PT" disabled={!data.sets.pt}>Começar em português</button>
</form>
<h2>Past runs</h2>
<table class="small"><tbody>{#each data.runs as r}<tr><td><a href="/benchmark/{r.id}">{new Date(r.startedAt).toLocaleDateString('en-GB')}</a></td><td>{r.lang}</td><td>set {r.parallelSet}</td><td>{r.finishedAt ? 'finished' : 'unfinished'}</td></tr>{:else}<tr><td class="muted">None yet.</td></tr>{/each}</tbody></table>
