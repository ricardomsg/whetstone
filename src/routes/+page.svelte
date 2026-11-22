<script lang="ts">
	import { EXERCISES, langLabel } from '$lib/content/exercises';
	import Ico from '$lib/components/Ico.svelte';
	import Spark from '$lib/components/Spark.svelte';
	import MessageCircleQuestion from '@lucide/svelte/icons/message-circle-question-mark';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Sun from '@lucide/svelte/icons/sun';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Check from '@lucide/svelte/icons/check';
	import Play from '@lucide/svelte/icons/play';
	import Flame from '@lucide/svelte/icons/flame';
	import Trophy from '@lucide/svelte/icons/trophy';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	let { data } = $props();

	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening';
	const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
	const done = (p: any) => Math.min(p.count, data.progress[`${p.exercise}:${p.lang}`] ?? 0);
	const steps = $derived(data.plan.plan as any[]);
	const totalUnits = $derived(steps.reduce((a, p) => a + p.count, 0));
	const doneUnits = $derived(steps.reduce((a, p) => a + done(p), 0));
	const next = $derived(steps.find((p) => done(p) < p.count));
	const link = (p: any) => `${p.href}&ds=${data.plan.id}&n=${Math.max(1, p.count - done(p))}`;
	const capture = [
		{ h: '/capture/word', t: 'New word', s: 'met while reading', i: BookOpen, c: 'VOC' },
		{ h: '/capture/recap', t: 'Recap', s: 'a conversation to remember', i: MessagesSquare, c: 'TRP' },
		{ h: '/checkin', t: 'Check-in', s: '', i: Sun, c: 'FL' }
	];
	const skills = $derived(data.snapshot.filter((s) => s.ratings.length || s.r7 != null));
	const tone = (s: number | null) => (s == null ? '' : s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
</script>

<div class="row" style="align-items:flex-end;margin-bottom:6px">
	<div>
		<div class="eyebrow">{today}</div>
		<h1>{greet}{data.displayName ? `, ${data.displayName}` : ''}</h1>
	</div>
	<span class="spacer"></span>
	{#if data.streak}<span class="tag warn"><Flame size={13} /> {data.streak}-day streak</span>{/if}
</div>

<section class="panel accent hero">
	<div class="row">
		<div>
			<div class="eyebrow">Today's session · {data.plan.minutes} min</div>
			<h2 style="margin:4px 0 0">{doneUnits >= totalUnits && totalUnits ? 'Done for today' : doneUnits ? 'Keep going' : 'Ready when you are'}</h2>
		</div>
		<span class="spacer"></span>
		<a class="small" href="/today">Adjust</a>
	</div>
	<div class="bar" style="margin:12px 0 4px"><i style="width:{totalUnits ? (100 * doneUnits) / totalUnits : 0}%"></i></div>
	<div class="faint tiny num">{doneUnits} of {totalUnits} done</div>
	<div class="steps">
		{#each steps as p}
			{@const m = EXERCISES[p.exercise]}
			{@const d = done(p)}
			<a class="step" class:done={d >= p.count} href={link(p)}>
				<Ico icon={m.icon} skill={m.skill} size={34} />
				<div style="flex:1;min-width:0">
					<div class="row nowrap" style="gap:6px"><b>{m.title}</b><span class="faint small num">{d}/{p.count}</span><span class="tag">{langLabel(p.lang)}</span></div>
					<div class="tiny muted">{p.reason}</div>
				</div>
				{#if d >= p.count}<span class="ok"><Check size={16} strokeWidth={3} /></span>{/if}
			</a>
		{/each}
	</div>
	{#if next}
		<a class="btn primary lg block" href={link(next)}><Play size={18} /> {doneUnits ? 'Continue' : 'Start'}: {EXERCISES[next.exercise].title}</a>
	{/if}
</section>

<section aria-labelledby="daily-tools-heading" class="daily-tools">
	<h2 id="daily-tools-heading">Use these during your day</h2>
	<p class="muted small">One before a break, the other when a word won't come.</p>
	<div class="grid2">
		<article class="panel tool-focus resume-focus">
			<div class="row nowrap"><Ico icon={Bookmark} skill="TRA" /><span class="eyebrow">Before a work break</span></div>
			<h3>Resume note</h3>
			<p>Save where you stopped and the next concrete action. About a minute now gives you a place to restart.</p>
			<p class="small muted">Choose your task, then tap Note. When you return, open the session's Notes.</p>
			<a class="btn block" href="/sessions">Choose a work session <ChevronRight size={16} /></a>
		</article>
		<article class="panel tool-focus tot-focus">
			<div class="row nowrap"><Ico icon={MessageCircleQuestion} skill="WR" /><span class="eyebrow">When a word won't come</span></div>
			<h3>Tip-of-the-tongue log</h3>
			<p>Write the meaning you were reaching for while it is still fresh. You can save it without knowing the word.</p>
			<p class="small muted">One sentence is enough to start. Come back to the log to resolve it and practise it later.</p>
			<a class="btn block" href="/capture/tot">Capture a missing word <ChevronRight size={16} /></a>
			<a class="btn block ghost" href="/capture/missed">Only the English came? Find it in Portuguese <ChevronRight size={16} /></a>
		</article>
	</div>
</section>

{#if !data.checkin || data.benchDue}
	<div class="grid2">
		{#if !data.checkin}<a class="panel tight nudge" href="/checkin"><Sun size={18} color="var(--warm)" /><span><b>Check in</b><br /><span class="small muted">Six quick answers for today</span></span><ChevronRight size={16} /></a>{/if}
		{#if data.benchDue}<a class="panel tight nudge" href="/benchmark"><Trophy size={18} color="var(--warm)" /><span><b>{data.lastBench ? 'Benchmark due' : 'First benchmark'}</b><br /><span class="small muted">About 15 minutes, sets your baseline</span></span><ChevronRight size={16} /></a>{/if}
	</div>
{/if}

<h2>Other tools</h2>
{#if data.threadsDue}<a class="panel tight nudge" style="margin-bottom:12px" href="/threads"><MessagesSquare size={18} /><span><b>{data.threadsDue} conversation{data.threadsDue === 1 ? '' : 's'} due for recall</b></span><ChevronRight size={16} /></a>{/if}
<div class="qa">
	{#each capture as c}
		<a href={c.h} class="qa-tile">
			<Ico icon={c.i} skill={c.c} size={40} />
			<b>{c.t}</b>
			<span>{c.h === '/checkin' ? (data.checkin ? 'done today' : '30 seconds') : c.s}</span>
		</a>
	{/each}
</div>
{#if data.due || data.inbox || data.openTots}
	<p class="small muted" style="margin-top:10px">
		{#if data.due}<a href="/x/b2">{data.due} {data.due === 1 ? 'card' : 'cards'} due</a>{/if}
		{#if data.inbox} · <a href="/words">{data.inbox} {data.inbox === 1 ? 'word' : 'words'} to confirm</a>{/if}
		{#if data.openTots} · <a href="/tot">{data.openTots} word{data.openTots === 1 ? '' : 's'} still on the tip of your tongue</a>{/if}
	</p>
{/if}

{#if skills.length}
	<div class="row" style="margin-top:26px"><h2 style="margin:0">Skills</h2><span class="spacer"></span><a class="small" href="/dashboard">Progress</a></div>
	<div class="skills">
		{#each skills as s}
			<a class="panel tight skill" href="/dashboard">
				<div class="tiny muted">{s.label}</div>
				<div class="row nowrap" style="justify-content:space-between;align-items:flex-end">
					<div><span class="v num">{s.r7 != null ? Math.round(s.r7) : '—'}</span><span class="tiny faint" style="margin-left:5px">7-day</span></div>
					<Spark values={s.spark} />
				</div>
				<div class="tiny faint num">{#each s.ratings as r}{r.lang === 'all' ? '' : langLabel(r.lang) + ' '}rating {Math.round(r.rating)}&nbsp;&nbsp;{/each}</div>
			</a>
		{/each}
	</div>
{/if}

{#if data.recent.length}
	<div class="row" style="margin-top:26px"><h2 style="margin:0">Latest</h2><span class="spacer"></span><a class="small" href="/history">History</a></div>
	<div class="panel flat" style="padding:2px 12px">
		<div class="list">
			{#each data.recent as r}
				{@const m = EXERCISES[r.exercise]}
				<a class="list-item" href="/history/{r.id}">
					<Ico icon={m.icon} skill={m.skill} size={32} />
					<div style="flex:1;min-width:0"><b>{r.title}</b><div class="tiny muted">{m.title} · {langLabel(r.lang)}</div></div>
					{#if r.score != null}<span class="tag {tone(r.score)} num">{r.score}</span>{/if}
				</a>
			{/each}
		</div>
	</div>
{/if}

<style>
	.hero h2 { font-size: 1.25rem; }
	.steps { display: flex; flex-direction: column; gap: 4px; margin: 14px 0; }
	.step { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; color: var(--text); }
	.step:hover { background: rgba(255, 255, 255, 0.03); color: var(--text); }
	.step.done { opacity: 0.6; }
	.ok { width: 26px; height: 26px; border-radius: 99px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); }
	.nudge { display: flex; align-items: center; gap: 12px; color: var(--text); margin: 0; }
	.nudge span { flex: 1; }
	.daily-tools { margin: 24px 0; }
	.daily-tools h2 { margin: 0 0 6px; }
	.daily-tools .grid2 { margin-top: 12px; }
	.tool-focus { display: flex; flex-direction: column; gap: 10px; margin: 0; }
	.tool-focus h3 { font-size: 1.1rem; margin: 0; }
	.tool-focus p { margin: 0; }
	.tool-focus .btn { margin-top: auto; }
	.resume-focus { border-color: color-mix(in srgb, var(--c-TRA) 30%, var(--line)); }
	.tot-focus { border-color: color-mix(in srgb, var(--c-WR) 30%, var(--line)); }
	.qa { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
	@media (max-width: 560px) { .qa { grid-template-columns: repeat(2, 1fr); } }
	.qa-tile { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: var(--radius); background: var(--panel); border: 1px solid var(--line-soft); color: var(--text); transition: border-color 0.15s, transform 0.1s; }
	.qa-tile:hover { border-color: var(--accent); color: var(--text); }
	.qa-tile:active { transform: scale(0.98); }
	.qa-tile b { font-size: 0.95rem; margin-top: 4px; }
	.qa-tile span { font-size: 0.78rem; color: var(--muted); }
	.skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
	.skill { margin: 0; color: var(--text); }
	.skill:hover { color: var(--text); border-color: var(--line); }
	.skill .v { font-size: 1.6rem; font-weight: 720; letter-spacing: -0.02em; }
</style>
