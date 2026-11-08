import type { z } from 'zod';

/** Flatten a zod error into { field: first message }. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
	const out: Record<string, string> = {};
	for (const issue of err.issues) {
		const k = String(issue.path[0] ?? '_form');
		out[k] ??= issue.message;
	}
	return out;
}

export function formObject(fd: FormData): Record<string, string> {
	const o: Record<string, string> = {};
	for (const [k, v] of fd.entries()) if (typeof v === 'string') o[k] = v;
	return o;
}
