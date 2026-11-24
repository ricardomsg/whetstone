<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import House from '@lucide/svelte/icons/house';
	import Target from '@lucide/svelte/icons/target';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import FolderGit from '@lucide/svelte/icons/folder-git-2';
	import History from '@lucide/svelte/icons/history';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import Settings from '@lucide/svelte/icons/settings';
	let { children } = $props();
	const tabs = [
		{ h: '/', l: 'Home', i: House, m: ['/'] },
		{ h: '/journal', l: 'Journal', i: NotebookPen, m: ['/journal'] },
		{ h: '/drills', l: 'Train', i: Target, m: ['/drills', '/x/', '/today', '/benchmark', '/tot', '/words', '/capture', '/checkin', '/threads'] },
		{ h: '/sessions', l: 'Sessions', i: FolderGit, m: ['/sessions'] },
		{ h: '/history', l: 'History', i: History, m: ['/history', '/attempts'] },
		{ h: '/dashboard', l: 'Progress', i: ChartLine, m: ['/dashboard'] }
	];
	const on = (t: (typeof tabs)[number]) => (t.h === '/' ? page.url.pathname === '/' : t.m.some((m) => page.url.pathname.startsWith(m)));
	// By route, not pathname: an encoded spelling of /login reaches the same route and must also render without the app's links.
	const bare = $derived(page.route.id === '/login');
	function shortcut(event: KeyboardEvent) {
		if (bare || event.defaultPrevented || event.repeat || event.isComposing || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.code !== 'KeyN') return;
		if (event.composedPath().some((target) => target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]')))) return;
		event.preventDefault();
		void goto('/sessions/note');
	}
</script>

<svelte:window onkeydown={shortcut} />

{#if !bare}
	<header class="top">
		<div class="in">
			<a class="brand" href="/" aria-label="Whetstone home">
				<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect x="3" y="12" width="26" height="9" rx="3" transform="rotate(-28 16 16)" fill="#3a4148" /><path d="M8 24 L24 9 L25.5 10.5 L9.5 25.5 Z" fill="var(--accent)" /><path d="M24 9 L27 7.5 L25.5 10.5 Z" fill="#eceeef" /></svg>
				<span>Whetstone</span>
			</a>
			<nav class="desk" aria-label="Main">
				{#each tabs as t}<a href={t.h} class:on={on(t)}><t.i size={17} />{t.l}</a>{/each}
			</nav>
			<span class="spacer"></span>
			<a class="gear" href="/settings" aria-label="Settings" class:on={page.url.pathname.startsWith('/settings')}><Settings size={20} /></a>
		</div>
	</header>
{/if}
<main>{@render children()}</main>
{#if !bare}
	<nav class="tabbar" aria-label="Main">
		{#each tabs as t}<a href={t.h} class:on={on(t)}><t.i size={22} strokeWidth={on(t) ? 2.3 : 1.8} /><span>{t.l}</span></a>{/each}
	</nav>
{/if}

<style>
	header.top { position: sticky; top: 0; z-index: 10; background: rgba(14, 16, 18, 0.82); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--line-soft); }
	header .in { max-width: 820px; margin: 0 auto; display: flex; align-items: center; gap: 14px; padding: 8px 18px; min-height: 56px; }
	.brand { display: flex; align-items: center; gap: 9px; color: var(--text); font-weight: 680; letter-spacing: -0.01em; font-size: 1.05rem; }
	.brand:hover { color: var(--text); }
	nav.desk { display: flex; gap: 2px; }
	nav.desk a { display: flex; align-items: center; gap: 7px; color: var(--muted); padding: 8px 11px; border-radius: 10px; font-size: 0.92rem; font-weight: 520; }
	nav.desk a:hover { color: var(--text); background: var(--panel-2); }
	nav.desk a.on { color: var(--text); background: var(--panel-2); }
	.gear { color: var(--muted); display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; }
	.gear:hover, .gear.on { color: var(--text); background: var(--panel-2); }
	nav.tabbar { display: none; }
	@media (max-width: 760px) {
		nav.desk { display: none; }
		nav.tabbar {
			display: grid; grid-template-columns: repeat(6, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
			height: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
			background: rgba(14, 16, 18, 0.92); backdrop-filter: saturate(1.4) blur(12px); border-top: 1px solid var(--line-soft);
		}
		nav.tabbar a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--faint); font-size: 0.7rem; font-weight: 560; }
		nav.tabbar a.on { color: var(--accent); }
	}
</style>
