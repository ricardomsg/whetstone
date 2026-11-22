<script lang="ts">
	let { data } = $props();
	const fmt = (t: number) => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="row"><h1>Tip-of-the-tongue log</h1><span class="spacer"></span><a class="btn primary" href="/capture/tot">Capture</a></div>
<table>
	<thead><tr><th>When</th><th>Meaning</th><th>Word</th><th></th></tr></thead>
	<tbody>
		{#each data.rows as r}
			<tr>
				<td class="small muted">{fmt(r.capturedAt)}<br />{r.lang === 'pt-PT' ? 'PT' : 'EN'}</td>
				<td>{r.meaning}{#if r.interlopers}<br /><span class="muted small">came to mind: {r.interlopers}</span>{/if}</td>
				<td>{#if r.word}<b>{r.word}</b><br /><span class="small muted">{r.resolution?.replace('_', ' ')}</span>{:else}<a href="/tot/{r.id}">Find it</a>{/if}</td>
				<td></td>
			</tr>
		{:else}
			<tr><td colspan="4" class="muted">Nothing captured yet.</td></tr>
		{/each}
	</tbody>
</table>
