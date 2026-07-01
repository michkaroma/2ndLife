import type { PageServerLoad } from './$types';
import { listOneTimeTasks, listRewards, getUserState, listOwnedCosmetics } from '$lib/server/db';

export const load: PageServerLoad = () => {
	const user = getUserState();
	return {
		// Feature 1 — tâches ponctuelles
		tasks: listOneTimeTasks({ status: 'todo' }),
		doneTasks: listOneTimeTasks({ status: 'done' }),
		// Feature 2 — données de l'Armurerie (inventaire cosmétique)
		cosmetics: listRewards({ kind: 'cosmetic' }),
		ownedIds: listOwnedCosmetics().map((o) => o.reward_id),
		playerName: user.player_name,
		equippedIds: {
			theme: user.equipped_theme_id,
			avatar_skin: user.equipped_skin_id,
			accessory: user.equipped_accessory_id,
			badge_frame: user.equipped_frame_id
		}
	};
};
