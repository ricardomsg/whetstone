<script lang="ts">
	let { data, form } = $props();
	const ago = (t: number | null) => {
		if (!t) return '—';
		const m = Math.round((Date.now() - t) / 60000);
		return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
	};
	const short = (p: string | null) => (p ? p.replace(/^\/home\/[^/]+\//, '~/') : '');
</script>

<h1>Work sessions</h1>
<p class="muted">Save where you stopped and what comes next. The resume drill asks you to recall both before showing your note when you return to a task.</p>
<p class="muted small">Desktop shortcut: <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> (<kbd>Option</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> on Mac) opens a note for your most recently active work session. It stays inactive while you type in a field. <a href="/sessions/note">Write that note</a></p>
<form method="POST" action="?/toggle" class="panel row">
	<div><b>Resume drills are {data.prompting ? 'on' : 'off'}.</b><br /><span class="muted small">{data.prompting ? 'Resuming a session asks you to recall before showing the note.' : 'Resuming shows the note straight away. Nothing prompts you.'}</span></div>
	<span class="spacer"></span>
	<input type="hidden" name="on" value={data.prompting ? '0' : '1'} />
	<button type="submit">{data.prompting ? 'Turn off' : 'Turn on'}</button>
</form>
{#if !data.transcripts}<p class="muted small">Claude Code sessions are not visible: WS_CLAUDE_PROJECTS_DIR is unset or not mounted.</p>{/if}

{#each data.sessions as s}
	<div class="panel" style="padding:10px 12px;margin:8px 0" data-sveltekit-preload-data="off">
		<div class="row" style="align-items:flex-start">
			<div style="flex:1;min-width:0">
				<a href="/sessions/{s.id}"><b>{s.title ?? s.id.slice(0, 8)}</b></a>
				<div class="muted small">{short(s.projectPath)}{s.source === 'manual' ? ' · manual' : ''} · {ago(s.lastActivity)}{#if s.note} · note {ago(s.note.createdAt)}{#if s.note.quality}, quality {(s.note.quality as any).score}{/if}{:else} · no note{/if}</div>
			</div>
			<a class="btn" href="/sessions/{s.id}?note=1">Note</a>
			<a class="btn primary" href="/sessions/{s.id}?resume=1">Resume</a>
		</div>
	</div>
{:else}
	<p class="muted">No sessions yet.</p>
{/each}
<p class="muted small">{#if data.showingAll}Showing all {data.total}. <a href="/sessions">Show recent work only</a>{:else}Showing recent titled work sessions. <a href="/sessions?all=1">Show all {data.total}</a>, including automated agents.{/if}</p>

<h2 id="new-session">Something else</h2>
<form method="POST" action="?/create" class="row">
	<input name="title" placeholder="A meeting, a task, a thread…" style="flex:1" />
	<button type="submit">New session</button>
</form>
{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
