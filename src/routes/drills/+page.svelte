<script lang="ts">
	import { EXERCISES, PAUSED } from '$lib/content/exercises';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	let { data } = $props();
	const games = Object.values(EXERCISES).filter((exercise) => exercise.kind === 'game').filter((exercise) => !PAUSED[exercise.code]);
	const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
	const cov = (ex: string, lang: string) => data.coverage.find((c) => c.exercise === ex && c.lang === lang);
</script>

<h1>Train</h1>
<p class="muted">Play a game, practise what you saved, or pick up where you left off.</p>
<a class="daily-link" href="/today"><div><b>Today's session</b><span class="small muted">Your daily plan brings games and follow-up practice together.</span></div><ChevronRight size={20} /></a>

<section aria-labelledby="games-heading">
	<h2 id="games-heading">Games</h2>
	<p class="muted small">{COUNT[games.length] ?? games.length} games you can play straight away, in English or European Portuguese.{#each Object.values(PAUSED) as note} {note}{/each}</p>
	<div class="games">
		{#each games as game}
			<article class="game" style:--game-colour={game.colour}>
				<div class="art"><img src={game.illustration} alt="" width="200" height="160" /></div>
				<div class="game-copy"><h3>{game.title}</h3><p>{game.short}</p><span class="small skill">{game.skillName}</span></div>
				<div class="langs">
					{#each (game.langLabels ? [['pt-PT', game.langLabels['pt-PT']], ['en', game.langLabels.en]] : [['en', 'English'], ['pt-PT', 'Português']]) as [lang, name]}
						{@const coverage = cov(game.code, lang)}
						<a class="lang" href="{game.href}?lang={lang}" aria-label="Play {game.title} in {name}">
							<span class="row nowrap"><b>{name}</b><ChevronRight size={14} /></span>
							{#if coverage}<span class="tiny muted num">{coverage.seen} / {coverage.total} seen</span>{/if}
						</a>
					{/each}
				</div>
				{#if game.setup}<a class="setup small" href={game.setup}>Choose languages: definition in one, answer in one or both <ChevronRight size={14} /></a>{/if}
			</article>
		{/each}
	</div>
</section>

<section aria-labelledby="tools-heading" class="tools">
	<h2 id="tools-heading">Tools &amp; practice</h2>
	<p class="muted small">Work with your saved words, conversations and tasks, or check your progress.</p>

	<section class="panel tool-group" aria-labelledby="vocabulary-heading">
		<h3 id="vocabulary-heading">Your vocabulary</h3>
		<p class="muted small">Save words, recall them later, and practise using them in your own sentences.</p>
		<div class="list">
			<a class="list-item" href="/words"><div><b>Word inbox</b><p class="small muted">Add a word you met while reading, then confirm its meaning to start learning it.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/tot"><div><b>Tip-of-the-tongue log</b><p class="small muted">Capture a word you could not find. Once resolved, it joins your review cards.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/capture/missed"><div><b>Missing in Portuguese</b><p class="small muted">Only the English word came? Save it, try to find the Portuguese at once, and meet it again in later rounds.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/x/b2"><div><b>Review</b><span class="count small">{data.due} due</span><p class="small muted">Recall words from their meaning or fill a gap. Cards come from your inbox, tip-of-the-tongue log and Definition → word practice.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/x/b3"><div><b>Use it</b><span class="count small">{data.learning} in learning</span><p class="small muted">Write sentences with words you confirmed in the inbox. This is separate from the sentence step inside Definition → word.</p></div><ChevronRight size={18} /></a>
		</div>
	</section>

	<section class="panel tool-group" aria-labelledby="conversations-heading">
		<h3 id="conversations-heading">Your conversations</h3>
		<p class="muted small">Start with a recap of a real conversation. The two practice modes use its confirmed key points.</p>
		<div class="list">
			<a class="list-item" href="/capture/recap"><div><b>Conversation recap</b><p class="small muted">Save what was decided, the current state and what is still open.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/threads"><div><b>Delayed recall</b><span class="count small">{data.threadsDue} due</span><p class="small muted">Recall a saved conversation before seeing its key points. The first recall is due the next day.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/threads"><div><b>Re-entry drill</b><p class="small muted">Choose a saved conversation, then write an opener to pick it up again. You have 60 seconds.</p></div><ChevronRight size={18} /></a>
		</div>
	</section>

	<section class="panel tool-group" aria-labelledby="work-heading">
		<h3 id="work-heading">Your work sessions</h3>
		<p class="muted small">Leave a note when you stop working. Use it to get back into the task later.</p>
		<div class="list">
			<a class="list-item" href="/sessions/note"><div><b>Resume note</b><p class="small muted">Write where you stopped, what comes next and anything still blocking you.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/sessions"><div><b>Sessions &amp; resume drill</b><p class="small muted">Choose a work session. Recall where you stopped before seeing your note. Switch the drill off to open the note directly.</p></div><ChevronRight size={18} /></a>
		</div>
	</section>

	<section class="panel tool-group" aria-labelledby="progress-heading">
		<h3 id="progress-heading">Assessments &amp; progress</h3>
		<div class="list">
			<a class="list-item" href="/benchmark"><div><b>Benchmark</b><span class="count small">Assessment</span><p class="small muted">A fixed test every four weeks to compare your progress over time. Allow about 15 minutes.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/checkin"><div><b>Check-in</b><p class="small muted">Six optional questions about sleep, energy and stress.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/history"><div><b>History</b><p class="small muted">See past answers and feedback, or dispute a judged score.</p></div><ChevronRight size={18} /></a>
			<a class="list-item" href="/dashboard"><div><b>Progress</b><p class="small muted">See your skill ratings and trends over time.</p></div><ChevronRight size={18} /></a>
		</div>
	</section>
	<a class="settings-link" href="/settings"><b>Settings</b><span class="small muted">AI feature switches, training preferences and data exports.</span><ChevronRight size={18} /></a>
</section>

<style>
	.daily-link { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; margin-top: 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--accent-soft); color: var(--text); }
	.daily-link span { display: block; margin-top: 2px; }
	.games { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
	.game { display: flex; flex-direction: column; overflow: hidden; border-radius: 18px; background: var(--panel); border: 1px solid color-mix(in srgb, var(--game-colour) 30%, var(--line)); }
	.art { display: grid; place-items: center; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--game-colour) 9%, transparent), transparent 75%); }
	.art img { width: 175px; height: 140px; }
	.game-copy { flex: 1; padding: 0 16px 16px; }
	.game h3 { font-size: 1.15rem; color: var(--game-colour); margin: 0 0 8px; }
	.game p { font-size: 0.9rem; margin-bottom: 10px; }
	.skill { color: var(--muted); }
	.langs { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
	.lang { padding: 12px; color: var(--text); }
	.lang + .lang { border-left: 1px solid var(--line); }
	.lang .row { justify-content: space-between; gap: 4px; font-size: 0.8rem; }
	.lang:hover { background: color-mix(in srgb, var(--game-colour) 10%, transparent); }
	.tools { margin-top: 36px; }
	.tool-group { margin-top: 18px; }
	.tool-group h3 { font-size: 1rem; margin: 0 0 4px; }
	.list-item { padding: 14px 0; }
	.list-item > div { flex: 1; }
	.list-item :global(svg), .settings-link :global(svg), .daily-link :global(svg) { flex: none; color: var(--muted); }
	.list-item p { margin: 3px 0 0; }
	.count { display: inline-block; margin-left: 10px; color: var(--accent); }
	.settings-link { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; color: var(--text); padding: 12px 0; }
	.settings-link span { flex: 1; }
	@media (max-width: 640px) {
		.games { grid-template-columns: 1fr; }
		.game { display: grid; grid-template-columns: 100px minmax(0, 1fr); }
		.art img { width: 100px; height: 100px; }
		.game-copy { padding: 18px 14px 16px 4px; }
		.game h3 { font-size: 1.1rem; }
		.langs { grid-column: 1 / -1; }
		.lang { padding: 12px 16px; }
	}
	.setup { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--line-soft); color: var(--muted); }
</style>
