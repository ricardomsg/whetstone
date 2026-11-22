import { guessLang } from '$lib/core/journal';
import { renderMarkdown } from '$lib/core/markdown';
import { linkFor, listEntries, readReport } from '$lib/server/journal/store';

/** "- **word**: meaning … *example*" lines under "## Words to try", so each can go to the word inbox. */
function wordsOf(md: string) {
	const sec = md.split(/^## /m).find((s) => s.startsWith('Words to try'));
	if (!sec) return [];
	return [...sec.matchAll(/^- \*\*(.+?)\*\*:\s*(.*)$/gm)].map((m) => {
		const example = m[2].match(/\*([^*]+)\*\s*$/)?.[1] ?? '';
		return { word: m[1], example, lang: guessLang(`${m[2]}`) };
	});
}

export const load = ({ params }) => {
	const md = readReport(params.name);
	const metas = listEntries();
	return { name: params.name, html: renderMarkdown(md, (t) => linkFor(t, metas)), words: wordsOf(md) };
};
