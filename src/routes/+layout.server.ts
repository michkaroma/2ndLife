import type { LayoutServerLoad } from './$types';
import { listHabits, getHabitLog, getUserState, getReward, localDate } from '$lib/server/db';
import { computeHabitStreaks } from '$lib/server/streaks';
import { levelInfoFromState } from '$lib/server/progression';
import { ensureQuests, recomputeQuestProgress } from '$lib/server/quests';
import type { SyncStateResponse, UserStateRow } from '$lib/types';

const EMPTY_USER: UserStateRow = {
	id: 1,
	total_xp: 0,
	coins: 0,
	prestige: 0,
	freezes: 0,
	last_active: null,
	last_freeze_grant: null,
	equipped_cosmetic_id: null,
	created_at: ''
};

export const load: LayoutServerLoad = ({ locals }) => {
	const date = localDate();

	if (!locals.authed) {
		const sync: SyncStateResponse = {
			userState: EMPTY_USER,
			level: levelInfoFromState(EMPTY_USER),
			today: { date, habits: [], globalStreak: 0 },
			quests: []
		};
		return { authed: false, equippedCosmetic: null, ...sync };
	}

	const habits = listHabits();
	const today = habits.map((h) => ({
		habit: h,
		log: getHabitLog(h.id, date),
		streak: computeHabitStreaks(h.id, date).current
	}));
	const globalStreak = today.reduce((m, h) => Math.max(m, h.streak), 0);
	const user = getUserState();
	const level = levelInfoFromState(user);

	// Quêtes : génère (idempotent) puis recalcule la progression.
	ensureQuests(level.level, date);
	const quests = recomputeQuestProgress(date);

	const equippedCosmetic = user.equipped_cosmetic_id ? getReward(user.equipped_cosmetic_id) : null;

	const sync: SyncStateResponse = {
		userState: user,
		level,
		today: { date, habits: today, globalStreak },
		quests
	};
	return { authed: true, equippedCosmetic, ...sync };
};
