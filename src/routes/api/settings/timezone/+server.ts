import type { RequestHandler } from './$types';
import { setTimezone, getTimezone } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';

/** Enregistre le fuseau horaire (chaîne IANA). Rejette un fuseau inconnu. */
export const POST: RequestHandler = async ({ request }) => {
	const b = (await request.json().catch(() => ({}))) as { timezone?: unknown };
	const tz = typeof b.timezone === 'string' ? b.timezone.trim() : '';
	if (!tz) return fail('VALIDATION', 'Fuseau horaire invalide.', 400);
	try {
		setTimezone(tz);
	} catch {
		return fail('VALIDATION', 'Fuseau horaire invalide.', 400);
	}
	return ok({ timezone: getTimezone() });
};
