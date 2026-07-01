// src/lib/server/streaks.ts
// Pure date math over recorded 'done' dates. Anchoring rule (brief §): the
// current streak counts consecutive 'done' days ending at today; if today is
// not yet logged it falls back to yesterday, so an un-logged today does not
// break the streak. 'skipped'/'relapsed' simply aren't in the 'done' set; a
// freeze is materialised by the progression engine as a synthetic 'done' log.

import { getHabitLogDates, previousDate, localDate, daysBetween, isoWeek, weekBounds } from './db';
import type { StreakInfo, CleanStreakInfo, AddictionTarget, WeeklyStatus } from '../types';

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

// =========================================================================
//  Weekly goals (objectifs « X fois / semaine » — Feature 3)
// =========================================================================

/** Décale une date 'YYYY-MM-DD' de `delta` jours (math calendaire locale). */
function shiftDays(date: string, delta: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() + delta);
	return localDate(dt);
}

/** Nombre de jours 'done' regroupés par semaine ISO. */
function doneCountByWeek(habitId: number): Map<string, number> {
	const byWeek = new Map<string, number>();
	for (const d of getHabitLogDates(habitId, 'done')) {
		const w = isoWeek(d);
		byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
	}
	return byWeek;
}

/**
 * Statut hebdomadaire d'une habitude à quota pour la semaine de `today`.
 * `streak` = semaines consécutives où le quota a été atteint, ancré sur la
 * semaine courante si déjà remplie, sinon sur la précédente (une semaine en
 * cours encore incomplète ne « casse » jamais la série — design non-punitif).
 */
export function weeklyStatus(
	habitId: number,
	quota: number,
	today: string = localDate()
): WeeklyStatus {
	const q = Math.max(1, quota);
	const byWeek = doneCountByWeek(habitId);
	const met = (week: string) => (byWeek.get(week) ?? 0) >= q;

	const curWeek = isoWeek(today);
	const count = byWeek.get(curWeek) ?? 0;
	const { start: curMonday } = weekBounds(today);

	let anchorMonday: string | null = null;
	if (met(curWeek)) anchorMonday = curMonday;
	else {
		const prevMonday = shiftDays(curMonday, -7);
		if (met(isoWeek(prevMonday))) anchorMonday = prevMonday;
	}

	let streak = 0;
	if (anchorMonday) {
		let cursor = anchorMonday;
		while (met(isoWeek(cursor))) {
			streak++;
			cursor = shiftDays(cursor, -7);
		}
	}
	return { count, quota: q, met: count >= q, streak };
}

/** Semaines consécutives remplies STRICTEMENT avant la semaine de `date`
 *  (sert au multiplicateur de bonus du quota). */
export function weeklyStreakBefore(
	habitId: number,
	quota: number,
	date: string = localDate()
): number {
	const q = Math.max(1, quota);
	const byWeek = doneCountByWeek(habitId);
	const met = (week: string) => (byWeek.get(week) ?? 0) >= q;
	const { start: curMonday } = weekBounds(date);

	let streak = 0;
	let cursor = shiftDays(curMonday, -7);
	while (met(isoWeek(cursor))) {
		streak++;
		cursor = shiftDays(cursor, -7);
	}
	return streak;
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
