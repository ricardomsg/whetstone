<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { post } from '$lib/api';
	let { data } = $props();
	let person = $state(''), topic = $state(''), cue = $state('');
	let points = $state<{ kind: string; text: string }[]>([]);
	let busy = $state(false), message = $state('');
	$effect(() => {
		person = data.thread.person; topic = data.thread.topic; cue = data.thread.cue;
		const incoming = data.points.map((p) => ({ kind: p.kind, text: p.text }));
		points = incoming.length ? incoming : [{ kind: 'fact', text: '' }];
	});
	async function save(event: SubmitEvent) {
		event.preventDefault(); busy = true; message = '';
		try {
			await post('/api/threads', { action: 'confirm', threadId: data.thread.id, version: data.thread.version, person, topic, cue, points });
			await goto('/threads');
		} catch (e) { message = String(e); } finally { busy = false; }
	}
	async function archive(archived: boolean) {
		busy = true; message = '';
		try {
			await post('/api/threads', { action: 'archive', threadId: data.thread.id, version: data.thread.version, archived });
			if (archived) await goto('/threads'); else await invalidateAll();
		} catch (e) { message = String(e); } finally { busy = false; }
	}
</script>
<a class="btn ghost sm" href="/threads">Conversations</a>
<h1>{data.thread.status === 'draft' ? 'Check the key points' : 'Conversation recap'}</h1>
<div class="panel"><div class="eyebrow">Your recap · {new Date(data.thread.capturedAt).toLocaleDateString('en-GB')}</div><p style="white-space:pre-wrap">{data.thread.recap}</p></div>
{#if data.thread.status === 'archived'}
	<p class="muted">This conversation is archived. Restore it to review its key points and schedule recall again.</p>
	<button onclick={() => archive(false)} disabled={busy}>Restore for review</button>
{:else}
	<p class="muted">Keep one fact, decision or open item per point. These are the reference for future recall, so correct anything the extraction missed or misunderstood.</p>
	<form onsubmit={save}>
		<label for="person">Person or group</label><input id="person" bind:value={person} maxlength="120" required />
		<label for="topic">Topic</label><input id="topic" bind:value={topic} maxlength="240" required />
		<label for="cue">Vague cue for the re-entry drill</label><input id="cue" bind:value={cue} maxlength="240" required />
		<p class="tiny muted">Name the topic without giving away its state or next step.</p>
		{#each points as point, index}
			<div class="panel tight">
				<label for="kind-{index}">Point {index + 1}</label>
				<div class="row"><select id="kind-{index}" bind:value={point.kind}><option value="fact">Fact</option><option value="decision">Decision</option><option value="open">Open item / next step</option></select><button type="button" class="ghost sm" aria-label="Remove point {index + 1}" onclick={() => points = points.filter((_, i) => i !== index)} disabled={points.length <= 1}>Remove</button></div>
				<textarea aria-label="Text for point {index + 1}" rows="2" bind:value={point.text} maxlength="600" required></textarea>
			</div>
		{/each}
		<button type="button" onclick={() => points = [...points, { kind: 'fact', text: '' }]} disabled={points.length >= 30}>Add point</button>
		<p class="small muted">Confirming new or changed key points schedules the first recall for tomorrow. Past drill references stay as they were.</p>
		<button class="primary lg block" style="margin-top:16px" disabled={busy}>{busy ? 'Saving…' : 'Confirm key points'}</button>
	</form>
	<button class="ghost sm" style="margin-top:12px" onclick={() => archive(true)} disabled={busy}>Archive conversation</button>
{/if}
{#if message}<p class="flash bad">{message}</p>{/if}
