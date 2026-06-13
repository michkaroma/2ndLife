import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/server/auth';
import { ok } from '$lib/server/respond';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return ok({ ok: true });
};
