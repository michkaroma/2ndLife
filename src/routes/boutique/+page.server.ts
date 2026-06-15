import type { PageServerLoad } from './$types';
import { listRewards, getUserState, listOwnedCosmetics, getReward } from '$lib/server/db';
import { levelInfoFromState } from '$lib/server/progression';

export const load: PageServerLoad = () => {
	const user = getUserState();
	const equippedIds = {
		theme:       user.equipped_theme_id,
		avatar_skin: user.equipped_skin_id,
		accessory:   user.equipped_accessory_id,
		badge_frame: user.equipped_frame_id
	};
	return {
		rewards:    listRewards(),
		coins:      user.coins,
		level:      levelInfoFromState(user).level,
		ownedIds:   listOwnedCosmetics().map((o) => o.reward_id),
		equippedIds
	};
};
