import type { RequestHandler } from './$types';
import { setPlayerName, getUserState } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';

/** Renomme le personnage. Nom vide → réinitialise au nom de stade par défaut. */
export const POST: RequestHandler = async ({ request }) => {
	const b = (await request.json().catch(() => ({}))) as { name?: unknown };
	const raw = typeof b.name === 'string' ? b.name.trim() : '';
	if (raw.length > 24) return fail('VALIDATION', 'Le nom est trop long (max 24 caractères).', 400);
	setPlayerName(raw.length === 0 ? null : raw);
	return ok({ playerName: getUserState().player_name });
};
