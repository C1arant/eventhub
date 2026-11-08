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
		command: process.env.E2E_SKIP_BUILD ? 'node server.js' : 'npm run build && node server.js',
		url: 'http://localhost:4173/healthz',
		timeout: 240_000,
		reuseExistingServer: false,
		env: {
			DATA_DIR: process.env.E2E_DATA_DIR,
			PORT: '4173',
			BODY_SIZE_LIMIT: '26214400',
			TZ: 'Europe/London'
		}
	}
});
