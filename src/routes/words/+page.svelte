<script lang="ts">
	let { data } = $props();
</script>

<div class="row"><h1>Words</h1><span class="spacer"></span><a class="btn primary" href="/capture/word">Add a word</a></div>
{#each [['Inbox — confirm to start practising', data.inbox], ['Learning', data.learning], ['Active', data.active]] as [title, rows]}
	<h2>{title} <span class="muted small">({(rows as any[]).length})</span></h2>
	<table>
		<tbody>
			{#each rows as any[] as v}
				<tr><td><a href="/words/{v.id}"><b>{v.word}</b></a> <span class="muted small">{v.lang === 'pt-PT' ? 'PT' : 'EN'}</span></td><td class="muted small">{(v.enrichment as any)?.definition ?? (v.enrichment ? '' : 'not enriched yet')}</td><td class="small">{v.productiveUses} uses · {v.useDays.length} days</td></tr>
			{:else}
				<tr><td class="muted">None.</td></tr>
			{/each}
		</tbody>
	</table>
{/each}
