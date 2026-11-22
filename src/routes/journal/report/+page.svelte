<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	let { data, form } = $props();
	let busy = $state(false);
	let showAll = $state(false);
	// svelte-ignore state_referenced_locally
	let notes = $state(form?.notes ?? '');
	// svelte-ignore state_referenced_locally
	let picked = $state<string[]>(form?.ids ?? (data.available ? data.picked : []));
	const metas = $derived(data.available ? data.metas : []);
	const visible = $derived(showAll ? metas : metas.filter((m, i) => i < 30 || picked.includes(m.id)));
	const size = $derived(metas.filter((m) => picked.includes(m.id)).reduce((s, m) => s + m.bytes, 0));
	const dayName = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
</script>

<h1>Report</h1>
{#if !data.available}
	<p class="flash warn">The journal folder is not mounted.</p>
{:else}
	<p class="muted">Say which entries to read and what you want looked at. The report is written into your journal folder under <code>Whetstone/Reports</code>.</p>
	<form method="POST" onsubmit={() => (busy = true)}>
		<label for="notes">What should it read, and what do you want looked at?</label>
		<textarea id="notes" name="notes" rows="4" bind:value={notes} placeholder="e.g. All my October entries. I keep using the same connectors; give me other ways to open a sentence."></textarea>
		<p class="tiny faint">Name the entries in your own words: a day, "last week", "October", "my voice journals from September", "my last five entries". Or pick them yourself below; a pick wins over what you wrote.</p>

		<details open={picked.length > 0}>
			<summary class="small">Pick entries yourself{#if picked.length} · {picked.length} picked{#if size}, about {Math.round(size / 1000)}k characters{/if}{/if}</summary>
			<div class="row" style="margin-top:8px">
				<span class="spacer"></span>
				{#if picked.length}<button type="button" class="ghost sm" onclick={() => (picked = [])}>Clear</button>{/if}
			</div>
			<div class="panel tight list pick">
				{#each visible as m}
					<label class="list-item small">
						<input type="checkbox" name="e" value={m.id} bind:group={picked} />
						<span>{dayName(m.day)}</span>
						{#if m.title.length > 10}<span class="faint tiny">{m.title.slice(10).replace(/^[\s-]+/, '')}</span>{/if}
						<span class="spacer"></span>
						{#if m.kind === 'voice'}<span class="tag">voice</span>{/if}
					</label>
				{/each}
				{#if !showAll && metas.length > 30}<button type="button" class="ghost sm" onclick={() => (showAll = true)}>Show all {metas.length}</button>{/if}
			</div>
		</details>
		{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
		<button class="primary lg block" type="submit" disabled={busy || (!picked.length && !notes.trim())}>{busy ? 'Reading your entries… up to a minute' : 'Write the report'}</button>
		<p class="tiny faint">Sends your request to the model to find the entries, then those entries and your request (Settings → model features). Nothing of it is kept in Whetstone's database; the report is a file in your vault.</p>
	</form>

	{#if data.reports.length}
		<h2>Earlier reports</h2>
		<div class="list">
			{#each data.reports as r}
				<a class="list-item" href="/journal/report/{encodeURIComponent(r.name)}">
					<span class="ico-bubble"><FileText size={18} /></span>
					<span class="col" style="gap:0"><b>{r.created || r.name}</b><span class="faint tiny">{r.entries.length} {r.entries.length === 1 ? 'entry' : 'entries'}</span></span>
				</a>
			{/each}
		</div>
	{/if}
{/if}

<style>
	summary { cursor: pointer; margin-top: 14px; color: var(--muted); }
	.pick { max-height: 50vh; overflow: auto; }
	.pick .list-item { margin: 0; padding: 9px 6px; cursor: pointer; color: var(--text); font-size: 0.92rem; }
</style>
