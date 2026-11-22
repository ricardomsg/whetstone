import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/server/env', () => ({
	env: {
		provider: 'anthropic',
		anthropicKey: 'test-key',
		anthropicWorkspaceId: 'test-workspace',
		modelFast: 'claude-haiku-5-5',
		modelJudge: 'claude-haiku-5-5',
		priceFast: '0.1/0.5',
		priceJudge: '0.1/0.5'
	}
}));

import { complete } from '../src/lib/server/llm/provider';
import { env } from '../src/lib/server/env';

afterEach(() => {
	env.modelFast = 'claude-haiku-5-5';
	env.anthropicWorkspaceId = 'test-workspace';
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Anthropic request compatibility', () => {
	function mockReply() {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			model: 'claude-haiku-5-5',
			content: [{ type: 'thinking', thinking: 'internal' }, { type: 'text', text: '{"ok":true}' }],
			usage: { input_tokens: 100, output_tokens: 20 }
		}), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('quick checks disable thinking and omit rejected sampling parameters', async () => {
		const fetchMock = mockReply();
		const result = await complete({ role: 'fast', messages: [{ role: 'user', content: 'Check a word.' }], think: false, temperature: 0.1 });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.thinking).toEqual({ type: 'disabled' });
		expect(body).not.toHaveProperty('temperature');
		expect(fetchMock.mock.calls[0][1].headers['anthropic-workspace-id']).toBe('test-workspace');
		expect(result.text).toBe('{"ok":true}');
		expect(result.costUsd).toBeCloseTo(0.00002);
	});

	it('grading uses adaptive thinking and leaves enough room for reasoning', async () => {
		const fetchMock = mockReply();
		await complete({ role: 'judge', messages: [{ role: 'user', content: 'Grade a sentence.' }], think: true });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.thinking).toEqual({ type: 'adaptive' });
		expect(body.output_config).toEqual({ effort: 'medium' });
		expect(body.max_tokens).toBe(6000);
		expect(body).not.toHaveProperty('temperature');
	});

	it('keeps legacy Haiku sampling and explicit output limits', async () => {
		env.modelFast = 'claude-haiku-4-5';
		env.anthropicWorkspaceId = '';
		const fetchMock = mockReply();
		await complete({ role: 'fast', messages: [{ role: 'user', content: 'Check a word.' }], temperature: 0.3, maxTokens: 800 });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.temperature).toBe(0.3);
		expect(body.max_tokens).toBe(800);
		expect(body).not.toHaveProperty('thinking');
		expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('anthropic-workspace-id');
	});
});
