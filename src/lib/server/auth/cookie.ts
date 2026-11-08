import type { Cookies } from '@sveltejs/kit';
import { SESSION_TTL_MS } from './sessions';

export const SESSION_COOKIE = 'eh_session';

export function setSessionCookie(cookies: Cookies, url: URL, token: string): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	});
}

export function clearSessionCookie(cookies: Cookies, url: URL): void {
	cookies.delete(SESSION_COOKIE, { path: '/', secure: url.protocol === 'https:' });
}
