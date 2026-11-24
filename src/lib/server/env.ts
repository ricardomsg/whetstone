import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env once for dev, scripts and tests; in Docker the variables come from compose.
if (!process.env.WS_ENV_LOADED && existsSync(resolve(process.cwd(), '.env'))) {
	process.loadEnvFile(resolve(process.cwd(), '.env'));
}
process.env.WS_ENV_LOADED = '1';

const e = process.env;
export const env = {
	dataDir: resolve(e.WS_DATA_DIR ?? './data'),
	migrationsDir: resolve(e.WS_MIGRATIONS_DIR ?? './src/lib/server/db/migrations'),
	rubricsDir: resolve(e.WS_RUBRICS_DIR ?? './rubrics'),
	contentDir: resolve(e.WS_CONTENT_DIR ?? './content'),
	claudeProjectsDir: e.WS_CLAUDE_PROJECTS_DIR ?? '',
	// Optional journal folder (Journal/, Journal/Voice Journals, and Whetstone/ for reports). Off when unset.
	journalDir: e.WS_JOURNAL_DIR ?? '',
	journalLinkPrefix: (e.WS_JOURNAL_LINK_PREFIX ?? '').replace(/^\/+|\/+$/g, '').replace(/(.+)/, '$1/'),
	displayName: (e.WS_DISPLAY_NAME ?? '').trim(),
	learnerProfile: (e.WS_LEARNER_PROFILE ?? '').trim() || 'someone who writes in English and European Portuguese',
	passphraseHash: e.WS_PASSPHRASE_HASH ?? '',
	// Optional: the Tailscale login that Tailscale Serve vouches for. Only safe when Serve is the only way in.
	tailscaleLogin: (e.WS_TAILSCALE_LOGIN ?? '').trim(),
	apiToken: e.WS_API_TOKEN ?? '',
	provider: (e.WS_LLM_PROVIDER || 'none') as 'deepseek' | 'anthropic' | 'ollama' | 'none',
	deepseekKey: e.WS_DEEPSEEK_API_KEY ?? '',
	deepseekBase: e.WS_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
	anthropicKey: e.WS_ANTHROPIC_API_KEY ?? '',
	anthropicWorkspaceId: e.WS_ANTHROPIC_WORKSPACE_ID ?? '',
	ollamaBase: e.WS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
	modelFast: e.WS_MODEL_FAST ?? 'deepseek-flash',
	modelJudge: e.WS_MODEL_JUDGE ?? 'deepseek-flash',
	// USD per million tokens, "in/out", for the cost log. Set these to your provider's current prices.
	priceFast: e.WS_PRICE_FAST ?? '0.22/0.66',
	priceJudge: e.WS_PRICE_JUDGE ?? '0.22/0.66',
	timezone: e.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
};
