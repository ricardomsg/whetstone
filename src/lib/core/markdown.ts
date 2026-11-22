// A small Markdown renderer for reports written into the journal folder: headings, paragraphs, lists, quotes,
// tables, bold, italics and [[wiki links]]. Everything is escaped first, so file content cannot inject HTML.

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string, link: (target: string) => string | null): string {
	return esc(s)
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, label?: string) => {
			const href = link(t.trim());
			const text = label ?? t;
			return href ? `<a href="${esc(href)}">${text}</a>` : text;
		})
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
		.replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function renderMarkdown(md: string, link: (target: string) => string | null = () => null): string {
	const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const l = lines[i];
		if (!l.trim()) {
			i++;
			continue;
		}
		const h = l.match(/^(#{1,4})\s+(.*)$/);
		if (h) {
			const n = Math.min(4, h[1].length + 1);
			out.push(`<h${n}>${inline(h[2], link)}</h${n}>`);
			i++;
			continue;
		}
		if (/^>\s?/.test(l)) {
			const q: string[] = [];
			while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
			out.push(`<blockquote>${q.map((x) => inline(x, link)).join('<br>')}</blockquote>`);
			continue;
		}
		if (/^\s*[-*]\s+/.test(l)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
			out.push(`<ul>${items.map((x) => `<li>${inline(x, link)}</li>`).join('')}</ul>`);
			continue;
		}
		if (/^\s*\d+[.)]\s+/.test(l)) {
			const items: string[] = [];
			const start = Number(l.match(/^\s*(\d+)/)![1]);
			while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
			out.push(`<ol${start > 1 ? ` start="${start}"` : ''}>${items.map((x) => `<li>${inline(x, link)}</li>`).join('')}</ol>`);
			continue;
		}
		if (/^\|.*\|\s*$/.test(l)) {
			const rows: string[][] = [];
			while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
				const cells = lines[i++].trim().slice(1, -1).split('|').map((c) => c.trim());
				if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
			}
			const [head, ...body] = rows;
			out.push(
				`<table><thead><tr>${(head ?? []).map((c) => `<th>${inline(c, link)}</th>`).join('')}</tr></thead><tbody>${body
					.map((r) => `<tr>${r.map((c) => `<td>${inline(c, link)}</td>`).join('')}</tr>`)
					.join('')}</tbody></table>`
			);
			continue;
		}
		const p: string[] = [lines[i++]];
		while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\|.*\|\s*$)/.test(lines[i])) p.push(lines[i++]);
		out.push(`<p>${p.map((x) => inline(x, link)).join('<br>')}</p>`);
	}
	return out.join('\n');
}
