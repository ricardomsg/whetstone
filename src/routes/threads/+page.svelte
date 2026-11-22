<script lang="ts">
	import { langLabel } from '$lib/content/exercises';
	let { data } = $props();
</script>
<h1>Conversations</h1>
<div class="row"><a class="btn primary" href="/capture/recap">New recap</a><a class="btn" href={data.archived ? '/threads' : '/threads?archived=1'}>{data.archived ? 'Active conversations' : 'Archived'}</a></div>
<p class="muted">Capture a conversation, check its key points, then recall it later. Key points stay hidden during practice.</p>
{#each data.threads as t}
	<div class="panel" data-sveltekit-preload-data="off">
		<div class="row"><b>{t.person} — {t.topic}</b><span class="spacer"></span><span class="tag">{langLabel(t.lang)}</span></div>
		<p class="small muted">{t.status === 'draft' ? 'Check the key points before practising.' : t.status === 'archived' ? 'Archived' : t.due != null && t.due <= data.now ? 'Delayed recall is due.' : `Next recall: ${new Date(t.due!).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}</p>
		<div class="row">
			{#if t.status === 'active'}
				{#if t.due != null && t.due <= data.now}<a class="btn primary" href="/threads/{t.id}/practice?exercise=C2">Recall</a>{/if}
				<a class="btn" href="/threads/{t.id}/practice?exercise=C3">Re-entry drill</a>
			{/if}
			<a class="btn" href="/threads/{t.id}">{t.status === 'draft' ? 'Review key points' : 'Open recap'}</a>
		</div>
	</div>
{:else}<p class="panel muted">{data.archived ? 'No archived conversations.' : 'No conversations yet. Start with a recap of a recent conversation.'}</p>{/each}
