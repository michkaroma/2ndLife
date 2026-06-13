import type { RequestHandler } from './$types';
import { getReward, listOwnedCosmetics, setEquippedCosmetic } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';

export const POST: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const reward = getReward(id);
	if (!reward || reward.kind !== 'cosmetic') return fail('NOT_FOUND', 'Cosmétique introuvable.', 404);
	const owned = listOwnedCosmetics().some((o) => o.reward_id === id);
	if (!owned) return fail('NOT_OWNED', "Tu ne possèdes pas ce cosmétique.", 409);
	setEquippedCosmetic(id);
	return ok({ equippedId: id });
};
