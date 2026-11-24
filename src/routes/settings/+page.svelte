<script lang="ts">
	let { data, form } = $props();
	const s = $derived(data.s);
	const total = $derived(data.spend.reduce((a, r) => a + r.cost, 0));
</script>

<h1>Settings</h1>
<form method="POST" action="?/save">
	<div class="panel">
		<h2 style="margin-top:0">Practice</h2>
		<div class="grid2">
			<div><label for="dl">Default language</label><select id="dl" name="defaultLang">{#each [['en', 'English'], ['pt-PT', 'Português'], ['mixed', 'Mixed']] as [v, l]}<option value={v} selected={s.defaultLang === v}>{l}</option>{/each}</select></div>
			<div><label for="sm">Session length</label><select id="sm" name="sessionMinutes">{#each [5, 15, 30] as m}<option value={m} selected={s.sessionMinutes === m}>{m} min</option>{/each}</select></div>
			<div><label for="ew">Effort window before hints (s)</label><input id="ew" name="effortWindowSec" type="number" min="5" max="60" value={s.effortWindowSec} /></div>
			<div><label for="hp">Points per hint</label><input id="hp" name="hintPenalty" type="number" min="5" max="25" value={s.hintPenalty} /></div>
			<div><label for="rc">Reviews per day, at most</label><input id="rc" name="reviewCap" type="number" min="5" max="200" value={s.reviewCap} /></div>
			<div><label for="gu">A word graduates after … correct uses</label><input id="gu" name="graduateUses" type="number" min="1" max="10" value={s.graduateUses} /></div>
			<div><label for="gd">… on at least … separate days</label><input id="gd" name="graduateDays" type="number" min="1" max="10" value={s.graduateDays} /></div>
		</div>
	</div>
	<div class="panel">
		<h2 style="margin-top:0">Work sessions</h2>
		<label class="row" style="color:var(--text)"><input type="checkbox" name="resumePrompting" checked={s.resumePrompting} style="width:auto;min-height:0" /> Resume drills on (recall before seeing the note). Also: <span class="kbd">ww resume on|off</span></label>
		<label for="tt">Transcript turns sent when summarising a session without a note</label><input id="tt" name="transcriptTailTurns" type="number" min="4" max="40" value={s.transcriptTailTurns} />
		<p class="muted small">Claude Code transcripts: {data.transcripts || 'not configured'} (read-only).</p>
	</div>
	<div class="panel">
		<h2 style="margin-top:0">What goes to a model</h2>
		<p class="muted small">Provider: <b>{data.provider.name}</b> · fast model {data.provider.fast} · judge model {data.provider.judge}. When a provider is enabled, every feature switched on below can send what it lists. Nothing else leaves this server.</p>
		<table class="small">
			<thead><tr><th>On</th><th>Feature</th><th>Sends</th></tr></thead>
			<tbody>{#each Object.entries(data.features) as [k, f]}<tr><td><input type="checkbox" name="llm-{k}" checked={s.llm[k]} style="width:auto;min-height:0" aria-label={f.label} /></td><td>{f.label}{#if f.work} <span class="tag warn">work content</span>{/if}</td><td class="muted">{f.sends}</td></tr>{/each}</tbody>
		</table>
	</div>
	<div class="row"><button class="primary" type="submit">Save</button>{#if form?.saved}<span class="muted">Saved.</span>{/if}</div>
</form>

<div class="panel">
	<h2 style="margin-top:0">Model usage, last 30 days</h2>
	<p>Total ≈ <b>${total.toFixed(3)}</b> <span class="muted small">(prices from env; check the provider's pricing page)</span></p>
	<table class="small"><thead><tr><th>Date</th><th>Feature</th><th>Calls</th><th>Tokens in/out</th><th>Cost</th></tr></thead>
		<tbody>{#each data.spend.slice(0, 40) as r}<tr><td>{r.date}</td><td>{r.feature}</td><td>{r.calls}</td><td>{r.tin}/{r.tout}</td><td>${r.cost.toFixed(4)}</td></tr>{:else}<tr><td colspan="5" class="muted">No calls yet.</td></tr>{/each}</tbody>
	</table>
</div>

<div class="panel">
	<h2 style="margin-top:0">Data</h2>
	<p class="small muted">{data.stats.items} items · {data.stats.attempts} attempts · {data.stats.lexicon} lexicon words · CLI token {data.tokenSet ? 'set' : 'not set'}</p>
	<div class="row"><a class="btn" href="/api/export/backup">Download a database backup</a><a class="btn" href="/api/export/json">Export everything as JSON</a><a class="btn" href="/api/export/csv">Export CSV files (ZIP)</a></div>
	{#if data.viaTailscale}
		<p class="small muted" style="margin-top:10px">Signed in through Tailscale.</p>
		{#if data.hasSession}<form method="POST" action="?/logout"><button>Clear passphrase session</button></form>{/if}
	{:else}<form method="POST" action="?/logout" style="margin-top:10px"><button>Log out</button></form>{/if}
</div>
