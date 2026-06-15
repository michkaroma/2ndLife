import type { LayoutServerLoad } from './$types';
import { listHabits, getHabitLog, getUserState, getReward, localDate } from '$lib/server/db';
import { computeHabitStreaks } from '$lib/server/streaks';
import { levelInfoFromState } from '$lib/server/progression';
import { ensureQuests, recomputeQuestProgress } from '$lib/server/quests';
import type { SyncStateResponse, UserStateRow, EquippedCosmetics } from '$lib/types';

const EMPTY_USER: UserStateRow = {
	id: 1,
	total_xp: 0,
	coins: 0,
	prestige: 0,
	freezes: 0,
	last_active: null,
	last_freeze_grant: null,
	equipped_theme_id: null,
	equipped_skin_id: null,
	equipped_accessory_id: null,
	equipped_frame_id: null,
	created_at: ''
};

const NULL_COSMETICS: EquippedCosmetics = { theme: null, skin: null, accessory: null, frame: null };

export const load: LayoutServerLoad = ({ locals }) => {
	const date = localDate();

	if (!locals.authed) {
		const sync: SyncStateResponse = {
			userState: EMPTY_USER,
			level: levelInfoFromState(EMPTY_USER),
			today: { date, habits: [], globalStreak: 0 },
			quests: []
		};
		return { authed: false, equippedCosmetics: NULL_COSMETICS, ...sync };
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

	const equippedCosmetics: EquippedCosmetics = {
		theme:     user.equipped_theme_id     ? getReward(user.equipped_theme_id)     : null,
		skin:      user.equipped_skin_id      ? getReward(user.equipped_skin_id)      : null,
		accessory: user.equipped_accessory_id ? getReward(user.equipped_accessory_id) : null,
		frame:     user.equipped_frame_id     ? getReward(user.equipped_frame_id)     : null
	};

	const sync: SyncStateResponse = {
		userState: user,
		level,
		today: { date, habits: today, globalStreak },
		quests
	};
	return { authed: true, equippedCosmetics, ...sync };
};
