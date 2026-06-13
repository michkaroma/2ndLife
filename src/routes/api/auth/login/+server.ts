import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import {
	passwordMatches,
	signSession,
	SESSION_COOKIE,
	SESSION_MAX_AGE
} from '$lib/server/auth';
import { ok, fail } from '$lib/server/respond';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let password = '';
	const ct = request.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		const b = (await request.json().catch(() => ({}))) as { password?: string };
		password = b.password ?? '';
	} else {
		const f = await request.formData();
		password = String(f.get('password') ?? '');
	}

	if (!passwordMatches(password)) {
		return fail('BAD_PASSWORD', 'Mot de passe incorrect.', 401);
	}

	cookies.set(SESSION_COOKIE, signSession(Date.now()), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_MAX_AGE
	});
	return ok({ ok: true });
};
