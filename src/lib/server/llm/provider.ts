import { createHash } from 'node:crypto';
import { env } from '../env';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface CompleteRequest {
	role: 'fast' | 'judge';
	messages: ChatMessage[];
	json?: boolean;
	temperature?: number;
	maxTokens?: number;
	/** Let the model reason before answering. Off for quick checks, on for rubric grading. */
	think?: boolean;
}

export interface CompleteResult {
	text: string;
	provider: string;
	model: string;
	tokensIn: number;
	tokensOut: number;
	costUsd: number;
	promptHash: string;
}

export class LlmUnavailable extends Error {}

function price(role: 'fast' | 'judge'): [number, number] {
	const [i, o] = (role === 'fast' ? env.priceFast : env.priceJudge).split('/').map(Number);
	return [i || 0, o || 0];
}

export function hashPrompt(messages: ChatMessage[], model: string): string {
	return createHash('sha256').update(model + '\n' + JSON.stringify(messages)).digest('hex').slice(0, 16);
}

async function openaiCompatible(base: string, key: string, model: string, req: CompleteRequest, provider: string) {
	const body: Record<string, unknown> = {
		model,
		messages: req.messages,
		temperature: req.temperature ?? 0.1,
		max_tokens: req.maxTokens ?? (req.think ? 6000 : 1200)
	};
	if (req.json) body.response_format = { type: 'json_object' };
	if (provider === 'deepseek' && !req.think) body.thinking = { type: 'disabled' };
	const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(req.think ? 180_000 : 60_000)
	});
	if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const d: any = await res.json();
	return {
		text: d.choices?.[0]?.message?.content ?? '',
		tokensIn: d.usage?.prompt_tokens ?? 0,
		tokensOut: d.usage?.completion_tokens ?? 0,
		model: d.model ?? model
	};
}

async function anthropic(model: string, req: CompleteRequest) {
	const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
	const messages = req.messages.filter((m) => m.role !== 'system');
	// Claude 5 models reject sampling settings; only Haiku can turn thinking off, the others think briefly at low effort.
	const claude5 = /^claude-[a-z]+-5(?:[.-]|$)/.test(model);
	const body: Record<string, unknown> = { model, system, messages, max_tokens: req.maxTokens ?? (req.think ? 6000 : 2000) };
	if (claude5) {
		if (req.think) body.thinking = { type: 'adaptive' };
		else if (model.startsWith('claude-haiku-')) body.thinking = { type: 'disabled' };
		body.output_config = { effort: req.think ? 'medium' : 'low' };
	} else {
		body.temperature = req.temperature ?? 0.1;
	}
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.anthropicKey,
			'anthropic-version': '2023-06-01',
			...(env.anthropicWorkspaceId ? { 'anthropic-workspace-id': env.anthropicWorkspaceId } : {})
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(120_000)
	});
	if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const d: any = await res.json();
	return {
		text: (d.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''),
		tokensIn: d.usage?.input_tokens ?? 0,
		tokensOut: d.usage?.output_tokens ?? 0,
		model: d.model ?? model
	};
}

export async function complete(req: CompleteRequest): Promise<CompleteResult> {
	const model = req.role === 'fast' ? env.modelFast : env.modelJudge;
	const promptHash = hashPrompt(req.messages, model);
	let r: { text: string; tokensIn: number; tokensOut: number; model: string };
	switch (env.provider) {
		case 'deepseek':
			if (!env.deepseekKey) throw new LlmUnavailable('WS_DEEPSEEK_API_KEY is not set');
			r = await openaiCompatible(env.deepseekBase, env.deepseekKey, model, req, 'deepseek');
			break;
		case 'ollama':
			r = await openaiCompatible(env.ollamaBase, '', model, req, 'ollama');
			break;
		case 'anthropic':
			if (!env.anthropicKey) throw new LlmUnavailable('WS_ANTHROPIC_API_KEY is not set');
			r = await anthropic(model, req);
			break;
		default:
			throw new LlmUnavailable('No LLM provider configured');
	}
	const [pi, po] = price(req.role);
	return { ...r, provider: env.provider, promptHash, costUsd: (r.tokensIn * pi + r.tokensOut * po) / 1e6 };
}

/** Pull the first JSON object out of a model reply (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
	const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
	try {
		return JSON.parse(t);
	} catch {
		const s = t.indexOf('{'),
			e = t.lastIndexOf('}');
		if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
		throw new Error('No JSON object in reply');
	}
}
