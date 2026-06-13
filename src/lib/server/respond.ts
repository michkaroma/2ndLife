// src/lib/server/respond.ts — JSON response helpers (FR error messages).
import { json } from '@sveltejs/kit';

export function ok<T>(data: T, status = 200): Response {
	return json(data, { status });
}

export function fail(code: string, message: string, status = 400): Response {
	return json({ error: { code, message } }, { status });
}
