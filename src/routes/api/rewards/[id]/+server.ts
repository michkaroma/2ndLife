import type { RequestHandler } from './$types';
import { getReward, deleteReward } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';

export const DELETE: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const reward = getReward(id);
	if (!reward) return fail('NOT_FOUND', 'Récompense introuvable.', 404);
	deleteReward(id);
	return ok({ ok: true });
};
