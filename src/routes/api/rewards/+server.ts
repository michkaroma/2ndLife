import type { RequestHandler } from './$types';
import { listRewards, createReward, getUserState } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';

export const GET: RequestHandler = () => {
	return ok({ rewards: listRewards(), coins: getUserState().coins });
};

export const POST: RequestHandler = async ({ request }) => {
	const b = (await request.json().catch(() => ({}))) as {
		name?: string;
		cost?: number;
		icon?: string | null;
	};
	const name = typeof b.name === 'string' ? b.name.trim() : '';
	const cost = Number(b.cost);
	if (!name || name.length > 60) return fail('VALIDATION', 'Nom de récompense invalide.', 400);
	if (!Number.isFinite(cost) || cost < 1) return fail('VALIDATION', 'Le coût doit être au moins 1.', 400);
	const reward = createReward({
		name,
		cost: Math.floor(cost),
		kind: 'real',
		icon: typeof b.icon === 'string' && b.icon ? b.icon : '🎁',
		repeatable: true,
		min_level: 1
	});
	return ok({ reward }, 201);
};
