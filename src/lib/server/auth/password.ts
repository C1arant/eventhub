import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id === 2 (const enum is unusable under verbatimModuleSyntax)
const OPTS = { algorithm: 2 } as const;

export function hashPassword(p: string): Promise<string> {
	return hash(p, OPTS);
}

export async function verifyPassword(hashed: string, p: string): Promise<boolean> {
	try {
		return await verify(hashed, p);
	} catch {
		return false;
	}
}
