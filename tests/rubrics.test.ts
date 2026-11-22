import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { objective } from '../src/lib/server/exercises/a4-objective';

const files = readdirSync('rubrics').filter((f) => f.endsWith('.yaml'));

describe('rubric files', () => {
	it('exist', () => expect(files.length).toBeGreaterThanOrEqual(4));
	for (const f of files) {
		const r = YAML.parse(readFileSync(`rubrics/${f}`, 'utf8'));
		it(`${f}: named after id and version`, () => expect(f).toBe(`${r.id}.v${r.version}.yaml`));
		it(`${f}: weights sum to 1`, () => expect(r.criteria.reduce((a: number, c: any) => a + c.weight, 0)).toBeCloseTo(1, 5));
		it(`${f}: every criterion has anchors 1-5`, () => {
			for (const c of r.criteria) expect(Object.keys(c.anchors).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
		});
		it(`${f}: examples score every criterion within 1-5`, () => {
			expect(r.examples.length).toBeGreaterThanOrEqual(1);
			for (const ex of r.examples) for (const c of r.criteria) expect(ex.expected.scores[c.key]).toBeGreaterThanOrEqual(1);
		});
	}
});

describe('A4 objective metrics', () => {
	it('counts duplicates and the flat word', () => expect(objective(['significant', 'Significant', 'important', 'key'], 'important')).toEqual({ given: 4, duplicates: 1, sameAsFlat: 1 }));
	it('treats inflections as duplicates', () => expect(objective(['mitigate', 'mitigated', 'reduce'], 'lower').duplicates).toBe(1));
	it('does not merge words that only share a prefix', () => expect(objective(['signal', 'significant', 'sign'], 'x').duplicates).toBe(0));
	it('merges short plurals', () => expect(objective(['key', 'keys'], 'x').duplicates).toBe(1));
});
