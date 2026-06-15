// src/lib/server/shop.ts — seed du catalogue boutique (cosmétiques + récompenses).
import { listRewards, createReward } from './db';
import { COSMETICS, REAL_REWARD_SEEDS } from '../config/shop';

export function seedShop(): void {
	if (listRewards().length > 0) return;
	for (const c of COSMETICS) {
		createReward({
			name: c.name,
			cost: c.cost,
			kind: 'cosmetic',
			category: c.category,
			asset_id: c.assetId,
			icon: c.icon,
			description: c.description,
			min_level: c.unlockLevel,
			repeatable: false
		});
	}
	for (const r of REAL_REWARD_SEEDS) {
		createReward({
			name: r.name,
			cost: r.cost,
			kind: 'real',
			icon: r.icon,
			description: null,
			min_level: 1,
			repeatable: true
		});
	}
}
