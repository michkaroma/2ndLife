import type { PageServerLoad } from './$types';
import { listRewards, getUserState, listOwnedCosmetics } from '$lib/server/db';
import { levelInfoFromState } from '$lib/server/progression';

export const load: PageServerLoad = () => {
	const user = getUserState();
	return {
		rewards: listRewards(),
		coins: user.coins,
		level: levelInfoFromState(user).level,
		ownedIds: listOwnedCosmetics().map((o) => o.reward_id),
		equippedId: user.equipped_cosmetic_id
	};
};
