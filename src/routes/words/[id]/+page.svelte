<script lang="ts">
	let { data } = $props();
	const v = $derived(data.v);
	const e = $derived((v.enrichment ?? {}) as any);
</script>

<h1>{v.word} <span class="muted small">{v.lang === 'pt-PT' ? 'PT' : 'EN'} · {v.stage}</span></h1>
{#if v.sourceSentence}<p class="muted">“{v.sourceSentence}”</p>{/if}

{#if !v.enrichment}
	<p class="flash warn">Not enriched yet (the model is off or failed).</p>
	<form method="POST" action="?/enrich"><button>Try again</button></form>
{/if}

<form method="POST" action="?/confirm">
	<div class="grid2">
		<div><label for="lemma">Word as it will be practised</label><input id="lemma" name="lemma" value={e.lemma ?? v.word} /></div>
		<div><label for="pos">Part of speech</label><input id="pos" name="pos" value={e.pos ?? ''} /></div>
	</div>
	<label for="def">Definition (the review prompt)</label>
	<textarea id="def" name="definition" rows="2">{e.definition ?? ''}</textarea>
	<label for="gap">Gapped sentence (use ___)</label>
	<input id="gap" name="gapped" value={e.gapped ?? ''} />
	<div class="grid2">
		<div><label for="reg">Register</label><input id="reg" name="register" value={e.register ?? ''} /></div>
		<div><label for="tr">{v.lang === 'pt-PT' ? 'English' : 'Portuguese'} equivalent</label><input id="tr" name="translation" value={e.translation ?? ''} /></div>
	</div>
	<label for="col">Collocations, one per line</label>
	<textarea id="col" name="collocations" rows="3">{(e.collocations ?? []).join('\n')}</textarea>
	<label for="ex">Examples, one per line</label>
	<textarea id="ex" name="examples" rows="3">{(e.examples ?? []).join('\n')}</textarea>
	<details class="panel"><summary class="muted">Sound hints</summary>
		<div class="grid2">
			<div><label for="syl">Syllables</label><input id="syl" name="syllables" value={e.hints?.syllables ?? ''} /></div>
			<div><label for="st">Stressed syllable</label><input id="st" name="stress" value={e.hints?.stress ?? ''} /></div>
		</div>
		<label for="fs">First sound</label><input id="fs" name="firstSound" value={e.hints?.firstSound ?? ''} />
		<label for="sim">Sounds like</label><input id="sim" name="similar" value={e.hints?.similar ?? ''} />
		<label for="ls">Last sound</label><input id="ls" name="lastSound" value={e.hints?.lastSound ?? ''} />
		<input type="hidden" name="concreteness" value={e.concreteness ?? 'abstract'} />
	</details>
	{#if v.stage === 'inbox'}<div class="row" style="margin-top:12px"><button class="primary" type="submit">Confirm and start practising</button></div>{/if}
</form>
{#if v.stage === 'inbox'}<form method="POST" action="?/discard" style="margin-top:8px"><button class="warn">Discard</button></form>{/if}
