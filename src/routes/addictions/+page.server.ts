import type { PageServerLoad } from './$types';
import { listAddictionTargets, getUserState, getTodayCheckins, localDate } from '$lib/server/db';
import { computeBossState } from '$lib/server/boss';
import { getTriggerStats } from '$lib/server/triggerStats';

export const load: PageServerLoad = () => {
	const today = localDate();
	const targets = listAddictionTargets();
	const checkins = getTodayCheckins(today);
	return {
		bosses: targets.map((t) =>
			computeBossState(t, today, checkins[t.id] ?? null)
		),
		freezes: getUserState().freezes,
		stats: getTriggerStats(null, 30)
	};
};
