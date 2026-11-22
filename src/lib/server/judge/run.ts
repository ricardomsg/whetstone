import { z } from 'zod';
import { complete, extractJson, LlmUnavailable, type ChatMessage } from '../llm/provider';
import { db, schema } from '../db';
import { newId } from '$lib/core/ids';
import { localDate } from '$lib/server/dates';
import { rubricToScore } from '$lib/core/scoring';
import { getRubric, weightsOf, type Rubric } from './rubrics';
import { featureEnabled } from '../settings';

export interface JudgeResult {
	scores: Record<string, number>;
	evidence: Record<string, string>;
	tips: string[];
	score: number; // weighted 0-100
	evalId: string;
	rubricId: string;
	rubricVersion: number;
}

function logUsage(feature: string, r: { provider: string; model: string; tokensIn: number; tokensOut: number; costUsd: number }) {
	db.insert(schema.llmUsage)
		.values({ id: newId('u'), date: localDate(), feature, provider: r.provider, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
		.run();
}

function systemPrompt(r: Rubric): string {
	const crit = r.criteria
		.map((c) => `- ${c.key} (weight ${c.weight}): ${c.question}\n` + Object.entries(c.anchors).map(([k, v]) => `    ${k}: ${v}`).join('\n'))
		.join('\n');
	const keys = r.criteria.map((c) => `"${c.key}": <integer 1-5>`).join(', ');
	return `${r.judge.instructions.trim()}

Criteria, each scored 1 to 5 against its anchors:
${crit}

Reply with one JSON object and nothing else:
{"scores": {${keys}}, "evidence": {"<criterion>": "<short quote or paraphrase from the attempt>"}, "tips": ["<one or two specific, actionable tips>"]}`;
}

function resultSchema(r: Rubric) {
	const s = Object.fromEntries(r.criteria.map((c) => [c.key, z.coerce.number().int().min(1).max(5)]));
	return z.object({
		scores: z.object(s),
		evidence: z.record(z.string(), z.string()).default({}),
		tips: z.array(z.string()).min(1).max(3)
	});
}

/** Grade an attempt against a rubric. Stores every call in judge_eval; retries on invalid output. */
export async function judge(rubricId: string, input: Record<string, unknown>, opts: { attemptId?: string; feature?: string } = {}): Promise<JudgeResult | null> {
	const feature = opts.feature ?? rubricId;
	if (!featureEnabled(feature)) return null;
	const r = getRubric(rubricId);
	const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(r) }];
	for (const ex of r.examples) {
		messages.push({ role: 'user', content: JSON.stringify(ex.input) });
		messages.push({ role: 'assistant', content: JSON.stringify(ex.expected) });
	}
	messages.push({ role: 'user', content: JSON.stringify(input) });
	const sch = resultSchema(r);
	let lastErr = '';
	for (let attemptNo = 0; attemptNo <= r.judge.max_retries; attemptNo++) {
		const msgs = lastErr
			? [...messages, { role: 'user' as const, content: `Your previous reply was invalid (${lastErr}). Reply again with only the JSON object.` }]
			: messages;
		let res;
		try {
			res = await complete({ role: r.judge.model_role, messages: msgs, json: true, temperature: r.judge.temperature, think: r.judge.think });
		} catch (e) {
			if (e instanceof LlmUnavailable) return null;
			lastErr = String(e);
			continue;
		}
		logUsage(feature, res);
		const evalId = newId('j');
		let parsed: z.infer<typeof sch> | null = null;
		try {
			parsed = sch.parse(extractJson(res.text));
		} catch (e) {
			lastErr = e instanceof Error ? e.message.slice(0, 200) : 'parse error';
		}
		db.insert(schema.judgeEval)
			.values({
				id: evalId,
				attemptId: opts.attemptId,
				purpose: rubricId,
				rubricId: r.id,
				rubricVersion: r.version,
				provider: res.provider,
				model: res.model,
				temperature: r.judge.temperature,
				promptHash: res.promptHash,
				rawResponse: res.text,
				parsed: parsed ?? undefined,
				ok: !!parsed,
				retries: attemptNo,
				tokensIn: res.tokensIn,
				tokensOut: res.tokensOut,
				costUsd: res.costUsd
			})
			.run();
		if (parsed) {
			const scores = parsed.scores as Record<string, number>;
			return { scores, evidence: parsed.evidence, tips: parsed.tips.slice(0, 2), score: rubricToScore(scores, weightsOf(r)), evalId, rubricId: r.id, rubricVersion: r.version };
		}
	}
	return null;
}

/**
 * A quick structured check (not a rubric): validation, enrichment, suggestions.
 * Uses the fast model without reasoning unless `think` is set.
 */
export async function check<T extends z.ZodTypeAny>(
	name: string,
	sch: T,
	system: string,
	user: unknown,
	opts: { attemptId?: string; think?: boolean; role?: 'fast' | 'judge'; maxTokens?: number; feature?: string; keepRaw?: boolean } = {}
): Promise<z.infer<T> | null> {
	if (!featureEnabled(opts.feature ?? name)) return null;
	const messages: ChatMessage[] = [
		{ role: 'system', content: system + '\n\nReply with one JSON object and nothing else.' },
		{ role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }
	];
	let lastErr = '';
	for (let i = 0; i < 3; i++) {
		const msgs = lastErr ? [...messages, { role: 'user' as const, content: `Invalid reply (${lastErr}). Reply again with only the JSON object.` }] : messages;
		let res;
		try {
			res = await complete({ role: opts.role ?? 'fast', messages: msgs, json: true, think: opts.think ?? false, maxTokens: opts.maxTokens });
		} catch (e) {
			if (e instanceof LlmUnavailable) return null;
			lastErr = String(e).slice(0, 200);
			continue;
		}
		logUsage(opts.feature ?? name, res);
		let parsed: z.infer<T> | null = null;
		try {
			parsed = sch.parse(extractJson(res.text));
		} catch (e) {
			lastErr = e instanceof Error ? e.message.slice(0, 200) : 'parse error';
		}
		db.insert(schema.judgeEval)
			.values({
				id: newId('j'),
				attemptId: opts.attemptId,
				purpose: name,
				provider: res.provider,
				model: res.model,
				temperature: 0.1,
				promptHash: res.promptHash,
				// Journal features keep nothing of the reply in the database: the journal folder is its only home.
				rawResponse: opts.keepRaw === false ? '' : res.text,
				parsed: opts.keepRaw === false ? undefined : ((parsed as any) ?? undefined),
				ok: !!parsed,
				retries: i,
				tokensIn: res.tokensIn,
				tokensOut: res.tokensOut,
				costUsd: res.costUsd
			})
			.run();
		if (parsed) return parsed;
	}
	return null;
}
