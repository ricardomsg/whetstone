<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { post } from '$lib/api';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import List from '@lucide/svelte/icons/list';
	import FileText from '@lucide/svelte/icons/file-text';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	let { data } = $props();

	type Opt = { text: string; note: string };
	type Status = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';
	let text = $state('');
	let baseHash = $state<string | null>(null);
	let status = $state<Status>('saved');
	let savedAt = $state<number | null>(null);
	let theirs = $state<{ text: string; hash: string | null } | null>(null);
	let showList = $state(false);
	let ta = $state<HTMLTextAreaElement | null>(null);
	let sel = { start: 0, end: 0 };
	// The help panel remembers what was selected when it opened, so a later click never edits other text.
	let help = $state<{ open: boolean; busy: boolean; selection: string; start: number; end: number; want: string; options: Opt[]; error: string; mode: 'reword' | 'find' }>({
		open: false, busy: false, selection: '', start: 0, end: 0, want: '', options: [], error: '', mode: 'reword'
	});
	let learned = $state<Record<string, string>>({});
	let timer: ReturnType<typeof setTimeout> | undefined;
	let loadedId = '';
	let inflight: Promise<void> | null = null;
	let leaving = $state(false); // editing is locked while a save finishes and the next entry loads
	let helpGen = 0; // a wording reply is used only by the panel that asked for it

	$effect(() => {
		if (!data.available) return;
		if (data.entry.id !== loadedId) {
			loadedId = data.entry.id;
			text = data.entry.text;
			baseHash = data.entry.hash;
			status = 'saved';
			savedAt = null;
			theirs = null;
			help.open = false;
			helpGen++;
			showList = false;
			leaving = false;
			queueMicrotask(grow);
		}
	});

	function grow() {
		if (!ta) return;
		ta.style.height = 'auto';
		ta.style.height = Math.max(ta.scrollHeight + 4, window.innerHeight * 0.55) + 'px';
	}

	const unsaved = () => status === 'dirty' || status === 'error' || status === 'saving';

	/**
	 * Save the buffer. One request at a time: a call made while one is in flight waits for it and then saves
	 * the newest text with the hash the server just returned. A reply for an entry no longer open is ignored.
	 */
	async function save(force = false): Promise<void> {
		if (!data.available || !data.entry.editable) return;
		clearTimeout(timer);
		while (inflight) await inflight;
		if (status === 'conflict' && !force) return;
		if (status === 'saved' && !force) return;
		const id = loadedId;
		const sent = text;
		if (!sent && baseHash === null) {
			status = 'saved'; // never create an empty file
			return;
		}
		const body = { id, text: sent, baseHash: force && theirs ? theirs.hash : baseHash };
		status = 'saving';
		inflight = (async () => {
			try {
				const res = await fetch('/api/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: sent.length < 30_000 });
				const r = await res.json();
				if (id !== loadedId) return;
				if (res.status === 409) {
					theirs = { text: r.text, hash: r.hash };
					status = 'conflict';
					return;
				}
				if (!res.ok) throw new Error(r.message ?? `HTTP ${res.status}`);
				baseHash = r.hash;
				savedAt = r.savedAt;
				theirs = null;
				// Typing that arrived while the request was out is still unsaved.
				status = text === sent ? 'saved' : 'dirty';
			} catch {
				if (id !== loadedId) return;
				status = 'error';
			}
		})();
		await inflight;
		inflight = null;
		if (id !== loadedId) return;
		const after = status as Status; // changed by the request above
		if (after === 'dirty') timer = setTimeout(() => save(), 1500);
		else if (after === 'error') timer = setTimeout(() => save(), 5000);
	}

	function edited() {
		if (status !== 'conflict' && status !== 'saving') status = 'dirty';
		grow();
		clearTimeout(timer);
		timer = setTimeout(() => save(), 1500);
	}

	function loadTheirs() {
		if (!theirs) return;
		if (!confirm('Replace what is here with the other version? What you typed here will be lost.')) return;
		text = theirs.text;
		baseHash = theirs.hash;
		theirs = null;
		status = 'saved';
		queueMicrotask(grow);
	}

	// Leaving an entry waits for its save; leaving with a conflict open asks first. Once a navigation inside
	// the app is under way, the editor is locked so nothing typed while the next entry loads is lost.
	beforeNavigate(({ cancel, to, willUnload }) => {
		const inApp = !willUnload && !!to; // a client-side navigation; a closed tab or external link unloads the page
		if (status === 'conflict') {
			if (!confirm('This entry has a conflict that is not resolved. Leave anyway? What you typed since will be lost.')) cancel();
			else if (inApp) lock();
			return;
		}
		if (!unsaved()) {
			if (inApp) lock();
			return;
		}
		cancel(); // for a closed tab or reload this makes the browser ask before leaving
		if (!inApp) {
			void save();
			return;
		}
		lock();
		void save().then(() => {
			if (status === 'saved') goto(to!.url).catch(() => (leaving = false));
			else leaving = false;
		});
	});

	/** Lock editing for a navigation; afterNavigate unlocks, and a navigation that never completes unlocks after 15 s. */
	function lock() {
		leaving = true;
		const id = loadedId;
		setTimeout(() => {
			if (loadedId === id) leaving = false;
		}, 15_000);
	}

	// Also when the navigation went to the entry already open, which loads nothing new.
	afterNavigate(() => {
		leaving = false;
	});

	function flushIfHidden() {
		if (document.visibilityState === 'hidden' && (status === 'dirty' || status === 'error')) void save();
	}

	function trackSel() {
		if (ta && document.activeElement === ta) sel = { start: ta.selectionStart, end: ta.selectionEnd };
	}

	/** The sentence around the selection: from the last stop or line break before it to the next one after. */
	function sentenceAround(start: number, end: number): string {
		const before = text.slice(0, start);
		const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
		const rest = text.slice(end);
		const m = rest.search(/[.!?\n]/);
		return text.slice(from, m < 0 ? text.length : end + m + 1).trim();
	}

	function openHelp(mode: 'reword' | 'find') {
		trackSel();
		const raw = text.slice(sel.start, sel.end);
		const selection = mode === 'reword' ? raw : '';
		helpGen++;
		help = { open: true, busy: false, selection, start: mode === 'reword' ? sel.start : sel.end, end: sel.end, want: '', options: [], error: '', mode };
		if (selection.trim()) void ask();
	}

	async function ask() {
		const gen = ++helpGen;
		help.busy = true;
		help.error = '';
		help.options = [];
		try {
			const r = await post<{ options: Opt[] }>('/api/journal/help', {
				selection: help.selection,
				sentence: sentenceAround(help.start, help.end),
				want: help.want
			});
			if (gen === helpGen) help.options = r.options;
		} catch (e) {
			if (gen === helpGen) help.error = e instanceof Error ? e.message : 'No answer';
		} finally {
			if (gen === helpGen) help.busy = false;
		}
	}

	function use(o: Opt) {
		if (leaving) return;
		let { start, end } = help;
		if (help.selection) {
			// The text may have moved since the panel opened: find the selection again, or refuse.
			if (text.slice(start, end) !== help.selection) {
				const at = text.indexOf(help.selection);
				if (at < 0 || text.indexOf(help.selection, at + 1) >= 0) {
					help.error = 'The selected words changed. Select them again.';
					return;
				}
				start = at;
				end = at + help.selection.length;
			}
		} else {
			start = end = Math.min(start, text.length);
		}
		// Keep the spacing that surrounded the selection.
		const lead = help.selection.match(/^\s*/)?.[0] ?? '';
		const trail = help.selection.match(/\s*$/)?.[0] ?? '';
		const insert = help.selection ? lead + o.text + trail : o.text;
		text = text.slice(0, start) + insert + text.slice(end);
		sel = { start, end: start + insert.length };
		help.open = false;
		edited();
		queueMicrotask(() => {
			ta?.focus();
			ta?.setSelectionRange(start + insert.length, start + insert.length);
		});
	}

	async function learn(o: Opt) {
		learned[o.text] = '…';
		try {
			const r = await post<{ url: string }>('/api/words', { word: o.text, note: 'journal wording help' });
			learned[o.text] = r.url;
		} catch {
			learned[o.text] = '';
		}
	}

	const months = $derived.by(() => {
		if (!data.available) return [];
		const g = new Map<string, typeof data.metas>();
		for (const m of data.metas) {
			const k = m.day.slice(0, 7);
			g.set(k, [...(g.get(k) ?? []), m]);
		}
		return [...g.entries()];
	});
	const words = $derived((text.match(/[\p{L}][\p{L}'’-]*/gu) ?? []).length);
	const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	const monthName = (k: string) => new Date(k + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
	const dayName = (d: string) => {
		if (!d) return '';
		const t = new Date(d + 'T12:00');
		const thisYear = t.getFullYear() === new Date().getFullYear();
		return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
	};
	const href = (id: string) => `/journal?e=${encodeURIComponent(id)}`;
	const oneWord = (s: string) => s.trim().split(/\s+/).length <= 3;
</script>

<svelte:document onselectionchange={trackSel} onvisibilitychange={flushIfHidden} />
<svelte:window onresize={grow} />

{#if !data.available}
	<h1>Journal</h1>
	<p class="flash warn">The journal folder is not mounted. Set <code>WS_JOURNAL_DIR</code> to your journal folder.</p>
{:else}
	<div class="bar-top row nowrap">
		<a class="btn ghost sm" href={data.older ? href(data.older.id) : undefined} aria-disabled={!data.older} aria-label="Older entry"><ChevronLeft size={18} /></a>
		<div class="title">
			<div class="eyebrow">{data.entry.kind === 'voice' ? 'Voice journal' : data.isToday ? 'Tonight' : 'Journal'}</div>
			<div class="day">{dayName(data.entry.day)}</div>
		</div>
		<a class="btn ghost sm" href={data.newer ? href(data.newer.id) : data.isToday ? undefined : href(data.today)} aria-disabled={!data.newer && data.isToday} aria-label="Newer entry"><ChevronRight size={18} /></a>
		<span class="spacer"></span>
		<button class="sm ghost" onclick={() => (showList = !showList)} aria-expanded={showList}><List size={16} /><span class="lbl">Entries</span></button>
		<a class="btn sm" href="/journal/report"><FileText size={16} /><span class="lbl">Report</span></a>
	</div>

	{#if showList}
		<div class="panel tight entries">
			{#if !data.isToday}<a class="list-item" href={href(data.today)}><b>Tonight</b><span class="spacer"></span><span class="tag good">write</span></a>{/if}
			{#each months as [k, ms]}
				<details open={k === data.entry.day.slice(0, 7)}>
					<summary class="muted small">{monthName(k)} · {ms.length}</summary>
					{#each ms as m}
						<a class="list-item small" class:cur={m.id === data.entry.id} href={href(m.id)}>
							<span>{m.title}</span><span class="spacer"></span>
							{#if m.kind === 'voice'}<span class="tag">voice</span>{/if}
							
						</a>
					{/each}
				</details>
			{/each}
		</div>
	{/if}

	<div class="ed" class:with-help={help.open}>
		<div class="ed-main">
			{#if data.entry.editable}
				<div class="tools row">
					<button class="sm" onpointerdown={trackSel} onclick={() => openHelp('reword')} title="Select words first"><WandSparkles size={15} /> Other words</button>
					<button class="sm" onpointerdown={trackSel} onclick={() => openHelp('find')}><Search size={15} /> Find a word</button>
					<span class="spacer"></span>
					<span class="faint tiny num">
						{words} words ·
						{#if status === 'saving'}saving…{:else if status === 'dirty'}not saved yet{:else if status === 'error'}<span style="color:var(--bad)">not saved, retrying</span>{:else if status === 'conflict'}<span style="color:var(--warm)">changed elsewhere</span>{:else if savedAt}saved {fmtTime(savedAt)}{:else if baseHash}in the vault{:else}new, saved as you write{/if}
					</span>
				</div>

				{#if status === 'conflict' && theirs}
					<div class="flash warn">
						This entry changed somewhere else (Obsidian or another device) while you were writing. Nothing was overwritten.
						<div class="row" style="margin-top:8px">
							<button class="sm" onclick={() => save(true)}>Keep what is here</button>
							<button class="sm ghost" onclick={loadTheirs}>Load the other version</button>
						</div>
					</div>
				{/if}

				<textarea
					bind:this={ta}
					bind:value={text}
					oninput={edited}
			readonly={leaving}
					onblur={() => save()}
					onselect={trackSel}
					onkeyup={trackSel}
					class="page"
					spellcheck="true"
					placeholder={data.isToday ? 'Tonight…' : ''}
					aria-label="Journal entry"
				></textarea>
			{:else}
				<p class="tiny faint">Read-only. The summary at the top was written by an AI; a report reads only the raw transcript.</p>
				<div class="page voice">{data.entry.text}</div>
			{/if}
		</div>

		{#if help.open}
			<aside class="help panel pop" aria-label="Wording help">
				<div class="row nowrap">
					<b>{help.mode === 'reword' ? 'Other words' : 'Find a word'}</b>
					<span class="spacer"></span>
					<button class="ghost sm" onclick={() => { help.open = false; helpGen++; }} aria-label="Close"><X size={16} /></button>
				</div>
				{#if help.mode === 'reword'}
					{#if help.selection.trim()}<p class="quote small">“{help.selection.trim()}”</p>{:else}<p class="small muted">Select a word or a sentence in the entry first, then press Other words.</p>{/if}
				{/if}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void ask();
					}}
				>
					<input bind:value={help.want} placeholder={help.mode === 'find' ? 'What do you mean? e.g. the cloth you sleep under' : 'Optional: what are you trying to say?'} />
					<button class="sm primary block" style="margin-top:8px" disabled={help.busy || (!help.selection.trim() && !help.want.trim())}>{help.busy ? 'Thinking…' : 'Suggest'}</button>
				</form>
				{#if help.error}<p class="flash bad small">{help.error}</p>{/if}
				<div class="opts">
					{#each help.options as o}
						<div class="opt">
							<button class="use" onclick={() => use(o)}><b>{o.text}</b>{#if o.note}<span class="small muted">{o.note}</span>{/if}</button>
							{#if oneWord(o.text)}
								{#if learned[o.text]}<a class="tiny" href={learned[o.text] === '…' ? undefined : learned[o.text]}>{learned[o.text] === '…' ? 'adding…' : 'in your words'}</a>
								{:else}<button class="ghost sm tiny" onclick={() => learn(o)} title="Add to the word inbox, to practise it">Learn</button>{/if}
							{/if}
						</div>
					{/each}
				</div>
				{#if help.options.length}<p class="tiny faint">Tap one to put it in the entry. Learn sends a word to your inbox for practice.</p>{/if}
			</aside>
		{/if}
	</div>
{/if}

<style>
	.bar-top { gap: 6px; margin: 2px 0 10px; }
	.bar-top a[aria-disabled='true'] { opacity: 0.3; pointer-events: none; }
	.title { min-width: 0; }
	.day { font-weight: 640; font-size: 1.08rem; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.entries { max-height: 55vh; overflow: auto; }
	.entries summary { cursor: pointer; padding: 6px 2px; }
	.entries .list-item { padding: 8px 6px; }
	.entries .list-item.cur { background: var(--accent-soft); border-radius: 8px; }
	.tools { margin: 4px 0 8px; gap: 6px; }
	.page {
		display: block; width: 100%; min-height: 55vh; background: var(--panel); border: 1px solid var(--line-soft); border-radius: var(--radius);
		padding: 18px 20px; font-size: 1.06rem; line-height: 1.75; resize: none; overflow: hidden;
	}
	.page.voice { white-space: pre-wrap; color: var(--muted); font-size: 0.98rem; overflow: auto; }
	/* Wide screens: the help panel is a second column beside the page. Narrower: a sheet over the bottom of the screen. */
	.help { position: fixed; z-index: 20; left: 8px; right: 8px; bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 8px); max-height: 50vh; overflow: auto; margin: 0; }
	@media (min-width: 761px) { .help { bottom: 12px; max-width: 640px; margin: 0 auto; } }
	@media (min-width: 1100px) {
		:global(main:has(.ed.with-help)) { max-width: 1220px; }
		.ed.with-help { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
		.help { position: sticky; top: 72px; left: auto; right: auto; bottom: auto; max-width: none; max-height: min(70vh, 640px); }
	}
	@media (max-width: 480px) { .lbl { display: none; } }
	.opts { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
	.opt { display: flex; align-items: center; gap: 6px; }
	.use { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; min-height: 0; padding: 8px 12px; }
</style>
