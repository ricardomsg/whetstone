<script lang="ts">
	import DrillHeader from '$lib/components/DrillHeader.svelte';
	let { data, form } = $props();
	let busy = $state(false);
</script>

<DrillHeader code="A8" guide={false} />
<h2 style="margin-top:4px">Missing in Portuguese</h2>
<p class="muted small">Only the English word came while you were speaking Portuguese? Save it here. You try to find the Portuguese straight away, before seeing it, and it comes back in later rounds, and in Review when the answer is one word.</p>
<form method="POST" onsubmit={() => (busy = true)}>
	<label for="cue">The English word or phrase</label>
	<input id="cue" name="cue" required placeholder="e.g. deadline, to follow up, awkward" autocomplete="off" autocapitalize="off" />
	<label for="ctx">What you were trying to say <span class="faint">(optional, in English or Portuguese)</span></label>
	<input id="ctx" name="context" placeholder="e.g. We moved the deadline to Friday." autocomplete="off" />
	{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
	<button class="primary lg block" style="margin-top:16px" type="submit" disabled={busy}>{busy ? 'Preparing… a few seconds' : 'Save and try it now'}</button>
	<p class="tiny faint">From a terminal: <code>ww pt "deadline"</code></p>
</form>

{#if data.misses.length}
	<section class="panel" style="margin-top:20px">
		<div class="eyebrow">Saved misses</div>
		<div class="list">
			{#each data.misses as m}
				<div class="row nowrap small miss">
					<b>{m.cue}</b>
					<span class="faint">→</span>
					{#if m.target}<span>{m.target}</span>{:else}<a href="/x/a8?lang=pt-PT&item={m.id}&n=1">try it</a>{/if}
					<span class="spacer"></span>
					<span class="faint num">{m.tries ? `${m.tries} tr${m.tries === 1 ? 'y' : 'ies'}` : 'not tried'}</span>
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	.miss { padding: 8px 0; border-bottom: 1px solid var(--line-soft); gap: 8px; }
	.miss:last-child { border-bottom: 0; }
</style>
