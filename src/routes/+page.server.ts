import type { PageServerLoad } from './$types';
import { listHabits, getHabitLog, getUserState, localDate } from '$lib/server/db';
import { computeHabitStreaks } from '$lib/server/streaks';
import { levelInfoFromState } from '$lib/server/progression';
import type { SyncStateResponse } from '$lib/types';

export const load: PageServerLoad = () => {
	const date = localDate();
	const habits = listHabits();
	const today = habits.map((h) => {
		const streak = computeHabitStreaks(h.id, date).current;
		return { habit: h, log: getHabitLog(h.id, date), streak };
	});
	const globalStreak = today.reduce((max, h) => Math.max(max, h.streak), 0);
	const user = getUserState();

	const payload: SyncStateResponse = {
		userState: user,
		level: levelInfoFromState(user),
		today: { date, habits: today, globalStreak },
		quests: [] // branché à l'étape 5
	};
	return payload;
};
