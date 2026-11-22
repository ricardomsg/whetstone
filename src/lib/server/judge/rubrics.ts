import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { env } from '../env';
import { db, schema } from '../db';

const Criterion = z.object({
	key: z.string(),
	weight: z.number().positive(),
	question: z.string(),
	anchors: z.record(z.string(), z.string())
});

const RubricFile = z.object({
	id: z.string(),
	version: z.number().int().positive(),
	exercise: z.string(),
	skills: z.array(z.string()),
	languages: z.array(z.string()),
	judge: z.object({
		model_role: z.enum(['fast', 'judge']).default('judge'),
		temperature: z.number().default(0.1),
		max_retries: z.number().int().default(2),
		think: z.boolean().default(true),
		instructions: z.string()
	}),
	input: z.record(z.string(), z.string()),
	objective: z.array(z.any()).optional(),
	criteria: z.array(Criterion).min(1),
	examples: z.array(z.object({ input: z.record(z.string(), z.any()), expected: z.record(z.string(), z.any()) })).default([]),
	output_schema: z.any().optional(),
	normalisation: z.record(z.string(), z.string()).optional()
});

export type Rubric = z.infer<typeof RubricFile> & { hash: string };

let cache: Map<string, Rubric> | null = null;
const broken = new Map<string, string>();

/** Load every rubric file. A file whose id+version was loaded before with different content is refused. */
export function loadRubrics(): Map<string, Rubric> {
	if (cache) return cache;
	const out = new Map<string, Rubric>();
	for (const f of readdirSync(env.rubricsDir).filter((f) => f.endsWith('.yaml'))) {
		try {
		const text = readFileSync(join(env.rubricsDir, f), 'utf8');
		const parsed = RubricFile.parse(YAML.parse(text));
		const expectedName = `${parsed.id}.v${parsed.version}.yaml`;
		if (f !== expectedName) throw new Error(`Rubric file ${f} should be named ${expectedName}`);
		const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
		const prior = db
			.select()
			.from(schema.rubric)
			.where(and(eq(schema.rubric.id, parsed.id), eq(schema.rubric.version, parsed.version)))
			.get();
		if (prior && prior.hash !== hash)
			throw new Error(`Rubric ${parsed.id} v${parsed.version} changed after use; bump its version instead of editing it`);
		if (!prior) db.insert(schema.rubric).values({ id: parsed.id, version: parsed.version, hash, body: text }).run();
		const cur = out.get(parsed.id);
		if (!cur || cur.version < parsed.version) out.set(parsed.id, { ...parsed, hash });
		} catch (e) {
			// One bad or edited rubric must not stop the others from grading.
			const id = f.replace(/\.v\d+\.yaml$/, '');
			broken.set(id, e instanceof Error ? e.message : String(e));
			console.error(`Rubric ${f} refused:`, broken.get(id));
		}
	}
	cache = out;
	return out;
}

export function getRubric(id: string): Rubric {
	const r = loadRubrics().get(id);
	if (!r) throw new Error(broken.get(id) ?? `Unknown rubric ${id}`);
	return r;
}

export function weightsOf(r: Rubric): Record<string, number> {
	return Object.fromEntries(r.criteria.map((c) => [c.key, c.weight]));
}
