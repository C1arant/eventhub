import { createHash, randomBytes } from 'node:crypto';

export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashToken(t: string): string {
	return createHash('sha256').update(t).digest('hex');
}
