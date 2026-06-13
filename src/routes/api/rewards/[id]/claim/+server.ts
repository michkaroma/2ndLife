import type { RequestHandler } from './$types';
import { getReward, getUserState, claimReward } from '$lib/server/db';
import { levelFromXp } from '$lib/config/progression';
import { ok, fail } from '$lib/server/respond';

export const POST: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const reward = getReward(id);
	if (!reward) return fail('NOT_FOUND', 'Récompense introuvable.', 404);

	const user = getUserState();
	const level = levelFromXp(user.total_xp).level;

	if (level < reward.min_level)
		return fail('LEVEL_LOCKED', `Débloqué au niveau ${reward.min_level}.`, 409);
	if (!reward.repeatable && reward.claimed_at)
		return fail('ALREADY_CLAIMED', 'Déjà obtenu.', 409);
	if (user.coins < reward.cost) return fail('NOT_ENOUGH_COINS', 'Pas assez de pièces.', 409);

	const updated = claimReward(id, level);
	if (!updated) return fail('CLAIM_FAILED', 'Achat impossible.', 409);

	return ok({ reward: updated, coins: getUserState().coins });
};
