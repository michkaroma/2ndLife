import type { RequestHandler } from './$types';
import { prestige, getUserState } from '$lib/server/db';
import { runAchievementChecks } from '$lib/server/achievements';
import { levelFromXp, PROGRESSION } from '$lib/config/progression';
import { COIN_ECONOMY } from '$lib/config/shop';
import { ok, fail } from '$lib/server/respond';

/** Entre en prestige : niveau → 1, +500 pièces, garde tout le reste. */
export const POST: RequestHandler = async () => {
	if (levelFromXp(getUserState().total_xp).level < PROGRESSION.PRESTIGE_LEVEL)
		return fail('NOT_ELIGIBLE', 'Prestige disponible au niveau 50.', 409);
	const p = prestige();
	const unlockedAchievements = runAchievementChecks();
	return ok({ prestige: p, coinsAwarded: COIN_ECONOMY.PRESTIGE_BONUS, unlockedAchievements });
};
