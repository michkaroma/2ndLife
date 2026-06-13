import type { RequestHandler } from './$types';
import { getHabit, updateHabit, archiveHabit, deleteHabit } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import { validateHabitPatch } from '$lib/server/schemas';

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!getHabit(id)) return fail('NOT_FOUND', 'Habitude introuvable.', 404);
	const body = await request.json().catch(() => ({}));
	const v = validateHabitPatch(body);
	if (!v.ok) return fail('VALIDATION', v.message, 400);
	return ok({ habit: updateHabit(id, v.value) });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const id = Number(params.id);
	if (!getHabit(id)) return fail('NOT_FOUND', 'Habitude introuvable.', 404);
	// ?hard=1 supprime définitivement (et ses logs) ; sinon archivage doux.
	if (url.searchParams.get('hard') === '1') {
		deleteHabit(id);
		return ok({ ok: true });
	}
	archiveHabit(id, true);
	return ok({ habit: getHabit(id) });
};
