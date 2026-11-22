<script lang="ts">
	import { goto } from '$app/navigation';
	import { post, LANGS } from '$lib/api';
	import Guidance from '$lib/components/Guidance.svelte';
	import Countdown from '$lib/components/Countdown.svelte';
	let { data } = $props();
	let person = $state(''), topic = $state(''), recap = $state('');
	let lang = $state('en');
	$effect(() => { lang = data.lang; });
	let requestId = $state(''), busy = $state(false), message = $state(''), endsAt = $state(0);
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true; message = '';
		requestId ||= crypto.randomUUID();
		try {
			const r = await post('/api/threads', { action: 'capture', requestId, person, topic, recap, lang });
			await goto(`/threads/${r.id}`);
		} catch (e) { message = String(e); }
		finally { busy = false; }
	}
</script>

<a class="btn ghost sm" href="/threads">Conversations</a>
<h1>Conversation recap</h1>
<Guidance code="C1" />
<form onsubmit={save}>
	<label for="person">Person or group</label><input id="person" bind:value={person} maxlength="120" required placeholder="Initials or a label are fine" />
	<label for="topic">Topic</label><input id="topic" bind:value={topic} maxlength="240" required />
	<div class="row" style="margin-top:12px"><label for="recap">What happened?</label><span class="spacer"></span>{#if endsAt}<Countdown {endsAt} label="Two-minute recap: " />{/if}</div>
	<textarea id="recap" bind:value={recap} rows="7" maxlength="6000" required onfocus={() => { endsAt ||= Date.now() + 120_000; }} placeholder="What was decided, what is still open, and what happens next?"></textarea>
	<div class="chip-row">{#each LANGS as l}<label class="choice"><input type="radio" bind:group={lang} value={l.v} /> {l.l}</label>{/each}</div>
	<p class="small muted">Aim for two minutes. Check and edit the suggested key points before they become your recall reference. If extraction is off or unavailable, you can add points yourself.</p>
	{#if message}<p class="flash bad">{message}</p><p class="small">If the connection failed after saving, <a href="/threads/{requestId}">check the saved recap</a> before starting another.</p>{/if}
	<button class="primary lg block" disabled={busy}>{busy ? 'Saving and finding the key points…' : 'Save recap'}</button>
</form>
