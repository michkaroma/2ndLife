// src/lib/server/streaks.ts
// Pure date math over recorded 'done' dates. Anchoring rule (brief §): the
// current streak counts consecutive 'done' days ending at today; if today is
// not yet logged it falls back to yesterday, so an un-logged today does not
// break the streak. 'skipped'/'relapsed' simply aren't in the 'done' set; a
// freeze is materialised by the progression engine as a synthetic 'done' log.

import { getHabitLogDates, previousDate, localDate, daysBetween } from './db';
import type { StreakInfo, CleanStreakInfo, AddictionTarget } from '../types';

export { daysBetween };

/**
 * Current streak = consecutive 'done' days ending at the anchor (today, else
 * yesterday). `doneDates` must be the ASC-sorted list of 'done' dates.
 */
export function currentStreakFromDates(doneDates: string[], today: string = localDate()): number {
	if (doneDates.length === 0) return 0;
	const set = new Set(doneDates);

	let anchor: string;
	if (set.has(today)) {
		anchor = today;
	} else {
		const yesterday = previousDate(today);
		if (set.has(yesterday)) anchor = yesterday;
		else return 0;
	}

	let count = 0;
	let cursor = anchor;
	while (set.has(cursor)) {
		count++;
		cursor = previousDate(cursor);
	}
	return count;
}

/** Best (longest-ever) run of consecutive 'done' calendar days. */
export function bestStreakFromDates(doneDates: string[]): number {
	if (doneDates.length === 0) return 0;
	const dates = [...new Set(doneDates)].sort();
	let best = 1;
	let run = 1;
	for (let i = 1; i < dates.length; i++) {
		if (daysBetween(dates[i - 1], dates[i]) === 1) {
			run++;
			if (run > best) best = run;
		} else {
			run = 1;
		}
	}
	return best;
}

/** Compute both current + best for one habit from the DB. */
export function computeHabitStreaks(habitId: number, today: string = localDate()): StreakInfo {
	const doneDates = getHabitLogDates(habitId, 'done');
	return {
		current: currentStreakFromDates(doneDates, today),
		best: bestStreakFromDates(doneDates)
	};
}

/**
 * Clean streak for an addiction target. Inclusive: clean_since itself counts as
 * "jour 1". moneySaved = currentDays * money_per_day (2 dp). bestDays never
 * regresses and absorbs an in-progress record.
 */
export function computeCleanStreak(
	t: AddictionTarget,
	today: string = localDate()
): CleanStreakInfo {
	let currentDays = 0;
	if (t.clean_since && t.clean_since <= today) {
		currentDays = daysBetween(t.clean_since, today) + 1;
	}
	const bestDays = Math.max(t.best_streak_days, currentDays);
	const moneySaved = Math.round(currentDays * t.money_per_day * 100) / 100;
	return { currentDays, bestDays, moneySaved };
}
