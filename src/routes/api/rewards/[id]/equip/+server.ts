import type { RequestHandler } from './$types';
import {
	getReward,
	getUserState,
	listOwnedCosmetics,
	setEquippedCosmeticForSlot
} from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import type { CosmeticSlot, UserStateRow } from '$lib/types';

const VALID_SLOTS = new Set<string>(['theme', 'avatar_skin', 'accessory', 'badge_frame']);

const SLOT_COL: Record<CosmeticSlot, keyof UserStateRow> = {
	theme: 'equipped_theme_id',
	avatar_skin: 'equipped_skin_id',
	accessory: 'equipped_accessory_id',
	badge_frame: 'equipped_frame_id'
};

export const POST: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const reward = getReward(id);
	if (!reward || reward.kind !== 'cosmetic') return fail('NOT_FOUND', 'Cosmétique introuvable.', 404);
	if (!reward.category || !VALID_SLOTS.has(reward.category)) {
		return fail('NO_CATEGORY', 'Cosmétique sans catégorie.', 409);
	}
	const owned = listOwnedCosmetics().some((o) => o.reward_id === id);
	if (!owned) return fail('NOT_OWNED', 'Tu ne possèdes pas ce cosmétique.', 409);

	setEquippedCosmeticForSlot(id, reward.category as CosmeticSlot);
	return ok({ equippedId: id, slot: reward.category });
};

/** Déséquipe : ne vide le slot que si CE cosmétique y est actuellement équipé. */
export const DELETE: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const reward = getReward(id);
	if (!reward || reward.kind !== 'cosmetic') return fail('NOT_FOUND', 'Cosmétique introuvable.', 404);
	if (!reward.category || !VALID_SLOTS.has(reward.category)) {
		return fail('NO_CATEGORY', 'Cosmétique sans catégorie.', 409);
	}
	const slot = reward.category as CosmeticSlot;
	const equippedHere = getUserState()[SLOT_COL[slot]];
	if (equippedHere === id) setEquippedCosmeticForSlot(null, slot);
	return ok({ equippedId: null, slot });
};
