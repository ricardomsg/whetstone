<script lang="ts">
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import { LANGS } from '$lib/api';
	let { data, form } = $props();
	let busy = $state(false);
</script>

<DrillHeader code="B1" />
<form method="POST" onsubmit={() => (busy = true)}>
	<label for="w">Word</label>
	<input id="w" class="big-input" name="word" value={data.word} required autocapitalize="off" />
	<label for="s">Sentence you found it in</label>
	<textarea id="s" name="sentence" rows="3">{data.sentence}</textarea>
	<input type="hidden" name="source" value={data.source} />
	<div class="chip-row" style="margin-top:10px">{#each LANGS as l}<label class="choice"><input type="radio" name="lang" value={l.v} checked={data.lang === l.v} /> {l.l}</label>{/each}</div>
	{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
	<button class="primary lg block" style="margin-top:16px" type="submit" disabled={busy}>{busy ? 'Looking it up…' : 'Add to inbox'}</button>
	<p class="tiny faint">You check the definition, examples and hints before it becomes a review card.</p>
</form>
