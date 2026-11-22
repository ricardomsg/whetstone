<script lang="ts">
	import { post } from '$lib/api';
	let { data } = $props();
	let added = $state<Record<string, string>>({});
	async function learn(w: { word: string; example: string; lang: string }) {
		added[w.word] = '…';
		try {
			const r = await post<{ url: string }>('/api/words', { word: w.word, lang: w.lang, note: `journal report ${data.name}` });
			added[w.word] = r.url;
		} catch {
			added[w.word] = '';
		}
	}
</script>

<p class="small"><a href="/journal/report">← Reports</a> · <a href="/journal">Journal</a></p>
<article class="report">{@html data.html}</article>

{#if data.words.length}
	<div class="panel accent">
		<b>Practise these words</b>
		<p class="small muted">Each goes to your word inbox, where you check it before it becomes a review card.</p>
		<div class="chip-row" style="margin-top:8px">
			{#each data.words as w}
				{#if added[w.word] && added[w.word] !== '…'}<a class="chip on" href={added[w.word]}>{w.word} ✓</a>
				{:else}<button class="chip" disabled={added[w.word] === '…'} onclick={() => learn(w)}>+ {w.word}</button>{/if}
			{/each}
		</div>
	</div>
{/if}
<p class="tiny faint">This report is the file <code>Whetstone/Reports/{data.name}.md</code> in your journal folder.</p>

<style>
	.report :global(h2) { font-size: 1.5rem; }
	.report :global(h3) { font-size: 1.12rem; margin-top: 28px; }
	.report :global(h4) { font-size: 0.98rem; margin-top: 18px; }
	.report :global(blockquote) { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--line); color: var(--muted); font-style: italic; }
	.report :global(ul), .report :global(ol) { padding-left: 22px; margin: 6px 0 12px; }
	.report :global(li) { margin: 4px 0; }
	.report :global(table) { margin: 8px 0 16px; font-size: 0.88rem; }
	.report :global(code) { font-family: var(--mono); font-size: 0.85em; }
</style>
