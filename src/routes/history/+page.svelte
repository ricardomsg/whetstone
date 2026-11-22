<script lang="ts">
	import { page } from '$app/state';
	import { EXERCISES, langLabel } from '$lib/content/exercises';
	import Ico from '$lib/components/Ico.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	let { data } = $props();

	const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
	const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	const groups = $derived.by(() => {
		const out: { day: string; rows: typeof data.rows }[] = [];
		for (const r of data.rows) {
			const d = day(r.at);
			if (out.at(-1)?.day !== d) out.push({ day: d, rows: [] });
			out.at(-1)!.rows.push(r);
		}
		return out;
	});
	function href(p: Record<string, string | undefined>) {
		const q = new URLSearchParams(page.url.searchParams);
		q.delete('before');
		for (const [k, v] of Object.entries(p)) v ? q.set(k, v) : q.delete(k);
		const s = q.toString();
		return s ? `?${s}` : '?';
	}
	const exs = ['A1', 'A2', 'A4', 'A8', 'B2', 'B3', 'D1', 'D2'];
	const tot = $derived(Object.fromEntries(data.totals.map((t) => [t.exercise, t])));
	const tone = (s: number | null) => (s == null ? '' : s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
	const cov = $derived(data.coverage.filter((c) => ['A1', 'A2', 'A4', 'A8'].includes(c.exercise)));
</script>

<h1>History</h1>
<p class="muted">Everything you have practised, with what you answered and how it scored.</p>

<div class="panel">
	<div class="eyebrow">Roster covered</div>
	<p class="small muted">Items you have seen do not come back until you have been through the rest.</p>
	<div class="cov">
		{#each cov as c}
			<div>
				<div class="row nowrap small"><span>{EXERCISES[c.exercise].title}</span><span class="tag">{langLabel(c.lang)}</span><span class="spacer"></span><span class="num faint">{c.seen}/{c.total}</span></div>
				<div class="bar"><i style="width:{(100 * c.seen) / c.total}%"></i></div>
			</div>
		{/each}
	</div>
</div>

<div class="chip-row scroll" style="margin:14px 0 6px">
	<a class="chip" class:on={!data.filters.exercise} href={href({ ex: undefined })}>All</a>
	{#each exs as e}<a class="chip" class:on={data.filters.exercise === e} href={href({ ex: e })}>{EXERCISES[e].title}{#if tot[e]}<span class="faint cnt">{tot[e].n}</span>{/if}</a>{/each}
</div>
<div class="chip-row scroll" style="margin-bottom:10px">
	<a class="chip" class:on={!data.filters.lang} href={href({ lang: undefined })}>Both languages</a>
	<a class="chip" class:on={data.filters.lang === 'en'} href={href({ lang: 'en' })}>English</a>
	<a class="chip" class:on={data.filters.lang === 'pt-PT'} href={href({ lang: 'pt-PT' })}>Português</a>
	<a class="chip" class:on={data.filters.unfinished} href={href({ all: data.filters.unfinished ? undefined : '1' })}>Include unfinished</a>
</div>

{#each groups as g}
	<div class="eyebrow" style="margin:18px 4px 4px">{g.day}</div>
	<div class="panel flat" style="padding:4px 12px;margin-top:6px">
		<div class="list">
			{#each g.rows as r}
				{@const m = EXERCISES[r.exercise]}
				<a class="list-item" href="/history/{r.id}">
					<Ico icon={m.icon} skill={m.skill} size={36} />
					<div style="flex:1;min-width:0">
						<div class="row nowrap" style="gap:8px"><b class="ellipsis">{r.title}</b>{#if r.bench}<span class="tag">benchmark</span>{/if}{#if r.overridden}<span class="tag warn">disputed</span>{/if}</div>
						<div class="small muted ellipsis">{m.title} · {langLabel(r.lang)} · {time(r.at)}{r.subtitle ? ` · ${r.subtitle}` : ''}</div>
					</div>
					{#if r.score != null}<span class="tag {tone(r.score)} num">{r.score}</span>{:else if !r.finished}<span class="tag">open</span>{/if}
					<ChevronRight size={16} color="var(--faint)" />
				</a>
			{/each}
		</div>
	</div>
{:else}
	<div class="panel flat"><p class="muted">Nothing here yet. Everything you practise will be listed.</p></div>
{/each}

{#if data.more}
	<div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href={href({ before: String(data.rows.at(-1)?.at) })}>Older</a></div>
{/if}

<style>
	.cov { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-top: 10px; }
	@media (max-width: 640px) { .cov { grid-template-columns: 1fr; } }
	.scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-left: -18px !important; margin-right: -18px !important; padding: 0 18px; }
	.scroll::-webkit-scrollbar { display: none; }
	.scroll > * { flex: none; white-space: nowrap; }
	.cnt { margin-left: 6px; }
	.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
