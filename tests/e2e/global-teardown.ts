import { rmSync } from 'node:fs';

export default function globalTeardown() {
	const dir = process.env.E2E_DATA_DIR;
	if (!dir) return;
	// The server may still hold the SQLite files briefly on Windows.
	try {
		rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	} catch {
		/* best effort: it is a temp dir */
	}
}
