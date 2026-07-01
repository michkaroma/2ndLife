// src/lib/server/achievements.ts
// Seed du catalogue + assemblage du GameState + vérification/déblocage des succès.
import {
	getDb,
	getUserState,
	getSetting,
	listHabits,
	listAddictionTargets,
	getHabitLogDates,
	listAchievements,
	unlockAchievement,
	addCoins,
	addXp,
	seedAchievements,
	localDate,
	weekBounds
} from './db';
import { computeHabitStreaks, bestStreakFromDates, computeCleanStreak } from './streaks';
import { levelFromXp } from '../config/progression';
import {
	ACHIEVEMENTS,
	checkAchievements,
	achievementReward
} from '../config/achievements';
import type { GameState } from '../config/types';
import type { Achievement as AchievementRow } from '../types';

/** Insère le catalogue des succès (idempotent). Appelé au démarrage. */
export function seedAchievementsCatalog(): void {
	seedAchievements(
		ACHIEVEMENTS.map((a) => ({
			key: a.key,
			name: a.name,
			description: a.description,
			icon: a.icon,
			reward_coins: achievementReward(a).coins
		}))
	);
}

function count(sql: string, ...args: unknown[]): number {
	return (getDb().prepare(sql).get(...args) as { c: number }).c;
}

/** Construit l'instantané agrégé de l'état de jeu. */
export function buildGameState(date: string = localDate()): GameState {
	const db = getDb();
	const u = getUserState();
	const level = levelFromXp(u.total_xp).level;
	const { start, end } = weekBounds(date);

	const totalDone = count(`SELECT COUNT(*) c FROM habit_logs WHERE status='done'`);
	const questsCompleted = count(`SELECT COUNT(*) c FROM quests WHERE completed=1`);
	const journalEntries = count(`SELECT COUNT(*) c FROM trigger_journal`);
	const journalEntriesThisWeek = count(
		`SELECT COUNT(*) c FROM trigger_journal WHERE date(date) BETWEEN ? AND ?`,
		start,
		end
	);
	const cravingsResisted = count(`SELECT COUNT(*) c FROM trigger_journal WHERE gave_in=0`);
	const doneToday = count(
		`SELECT COUNT(*) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
     WHERE l.date=? AND l.status='done' AND h.type='build'`,
		date
	);
	const distinctHabitsDoneToday = count(
		`SELECT COUNT(DISTINCT habit_id) c FROM habit_logs WHERE date=? AND status='done'`,
		date
	);
	const categoriesDoneToday = (
		db
			.prepare(
				`SELECT DISTINCT h.category cat FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.date=? AND l.status='done' AND h.type='build' AND h.category IS NOT NULL`
			)
			.all(date) as { cat: string }[]
	).map((r) => r.cat);

	// Séries (habitudes "build")
	let bestHabitStreak = 0;
	const habitStreaks: number[] = [];
	for (const h of listHabits()) {
		if (h.type !== 'build') continue;
		const dates = getHabitLogDates(h.id, 'done');
		bestHabitStreak = Math.max(bestHabitStreak, bestStreakFromDates(dates));
		habitStreaks.push(computeHabitStreaks(h.id, date).current);
	}

	// Addictions / boss
	let cleanDaysMax = 0;
	let cleanDaysTotalBest = 0;
	let moneySaved = 0;
	let bossesDefeated = 0;
	for (const t of listAddictionTargets()) {
		const c = computeCleanStreak(t, date);
		cleanDaysMax = Math.max(cleanDaysMax, c.currentDays);
		cleanDaysTotalBest = Math.max(cleanDaysTotalBest, t.best_streak_days);
		moneySaved += c.moneySaved;
		if (t.defeated_at) bossesDefeated++;
	}
	// inclut aussi les boss archivés/vaincus
	bossesDefeated = count(`SELECT COUNT(*) c FROM addiction_targets WHERE defeated_at IS NOT NULL`);

	const relapses =
		count(`SELECT COUNT(*) c FROM habit_logs WHERE status='relapsed' AND date BETWEEN ? AND ?`, start, end) +
		count(`SELECT COUNT(*) c FROM trigger_journal WHERE gave_in=1 AND date(date) BETWEEN ? AND ?`, start, end);

	return {
		level,
		totalXp: u.total_xp,
		coins: u.coins,
		prestige: u.prestige,
		freezes: u.freezes,
		totalDone,
		bestHabitStreak,
		habitStreaks,
		categoriesDoneToday,
		doneToday,
		distinctHabitsDoneToday,
		cleanDaysMax,
		cleanDaysTotalBest,
		bossesDefeated,
		moneySaved: Math.round(moneySaved),
		noRelapseThisWeek: relapses === 0,
		questsCompleted,
		journalEntries,
		journalEntriesThisWeek,
		sosUsed: getSetting<number>('sos_used') ?? 0,
		cravingsResisted
	};
}

/** Vérifie et débloque les succès atteints. Crédite leurs récompenses.
 *  Renvoie les lignes de succès nouvellement débloquées. */
export function runAchievementChecks(date: string = localDate()): AchievementRow[] {
	const state = buildGameState(date);
	const already = new Set(
		listAchievements()
			.filter((a) => a.unlocked_at)
			.map((a) => a.key)
	);
	const newly = checkAchievements(state, state, already);
	const unlocked: AchievementRow[] = [];
	for (const def of newly) {
		const row = unlockAchievement(def.key);
		if (row) {
			const reward = achievementReward(def);
			if (reward.coins) addCoins(reward.coins);
			if (reward.xp) addXp(reward.xp);
			unlocked.push(row);
		}
	}
	return unlocked;
}
