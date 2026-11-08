import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Fresh data dir per run. The env var is inherited by worker processes so every
// process that evaluates this config sees the same directory.
process.env.E2E_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'eventhub-e2e-'));

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.spec.ts',
	globalTeardown: './tests/e2e/global-teardown.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 90_000,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		command: process.env.E2E_SKIP_BUILD ? 'node build' : 'npm run build && node build',
		url: 'http://localhost:4173/setup',
		timeout: 240_000,
		reuseExistingServer: false,
		env: {
			DATA_DIR: process.env.E2E_DATA_DIR,
			ORIGIN: 'http://localhost:4173',
			// adapter-node 6 ignores ORIGIN at runtime and derives the request origin from
			// this header (the browser contexts send it, as a reverse proxy would).
			PROTOCOL_HEADER: 'x-forwarded-proto',
			PORT: '4173',
			BODY_SIZE_LIMIT: '26214400',
			TZ: 'Europe/London'
		}
	}
});
