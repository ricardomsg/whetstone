<script lang="ts">
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	import { LANGS } from '$lib/api';
	let { data, form } = $props();
	let more = $state(false);
</script>

<DrillHeader code="A7" />
<form method="POST">
	<label for="m">The meaning you were reaching for</label>
	<textarea id="m" name="meaning" rows="3" required placeholder="e.g. the word for when something lasts only a very short time"></textarea>
	<div class="chip-row" style="margin-top:10px">
		{#each LANGS as l}<label class="choice"><input type="radio" name="lang" value={l.v} checked={data.lang === l.v} /> {l.l}</label>{/each}
	</div>
	{#if more}
		<label for="i">What came to mind instead</label>
		<input id="i" name="interlopers" placeholder="wrong words, sounds, first letters" />
		<label for="c">Context</label>
		<select id="c" name="context"><option value="">—</option><option value="speaking-work">Speaking, work</option><option value="speaking-personal">Speaking, personal</option><option value="writing-work">Writing, work</option><option value="writing-personal">Writing, personal</option></select>
		<label for="w">Found it already?</label>
		<input id="w" name="word" placeholder="the word, if resolved" />
		<select name="resolution" aria-label="How it was resolved"><option value="self">I found it myself</option><option value="looked_up">I looked it up</option></select>
	{/if}
	{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
	<div class="row" style="margin-top:16px">
		<button class="primary lg" style="flex:1" type="submit">Save</button>
		{#if !more}<button class="lg" type="button" onclick={() => (more = true)}>More details</button>{/if}
	</div>
	<p class="tiny faint">Not found yet? After saving you get sound hints first, then suggestions.</p>
</form>
