import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' })
		})
	],
	server: { host: '127.0.0.1', port: 5173, allowedHosts: (loadEnv(mode, process.cwd(), 'WS_ALLOWED_HOSTS').WS_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean) },
	test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'] }
}));
