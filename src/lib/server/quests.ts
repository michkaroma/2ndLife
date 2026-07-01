// src/lib/server/quests.ts
// Génération idempotente des quêtes par période + recalcul de la progression
// à partir d'agrégats SQL (robuste, ré-exécutable sans risque de double-compte).
import {
	getDb,
	localDate,
	isoWeek,
	weekBounds,
	listQuests,
	upsertQuest,
	setQuestProgress,
	listHabits
} from './db';
import { computeHabitStreaks } from './streaks';
import { generateDailyQuests, generateWeeklyQuests } from '../config/quests';
import type { Quest } from '../types';

/** Génère (si absentes) les quêtes du jour et de la semaine pour ce niveau. */
export function ensureQuests(level: number, date: string = localDate()): void {
	const week = isoWeek(date);
	for (const q of generateDailyQuests(date, level)) {
		upsertQuest({
			scope: q.scope,
			kind: q.kind,
			key: q.key,
			description: q.description,
			target: q.target,
			rewardXp: q.reward_xp,
			rewardCoins: q.reward_coins,
			period: date
		});
	}
	for (const q of generateWeeklyQuests(week, level)) {
		upsertQuest({
			scope: q.scope,
			kind: q.kind,
			key: q.key,
			description: q.description,
			target: q.target,
			rewardXp: q.reward_xp,
			rewardCoins: q.reward_coins,
			period: week
		});
	}
}

/** Quêtes courantes (jour + semaine). */
export function getCurrentQuests(date: string = localDate()): Quest[] {
	return [...listQuests(date, 'daily'), ...listQuests(isoWeek(date), 'weekly')];
}

interface Aggregates {
	dailyBuild: number;
	dailyClean: number;
	dailyCategories: number;
	dailyJournal: number;
	weeklyBuild: number;
	weeklyCleanDays: number;
	weeklyVarietyDays: number;
	weeklyJournal: number;
	weeklyNoRelapse: boolean;
	maxCurrentStreak: number;
}

function num(row: unknown): number {
	return (row as { c: number } | undefined)?.c ?? 0;
}

function computeAggregates(date: string): Aggregates {
	const db = getDb();
	const { start, end } = weekBounds(date);

	const dailyBuild = num(
		db
			.prepare(
				`SELECT COUNT(*) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.date=? AND l.status='done' AND h.type='build'`
			)
			.get(date)
	);
	const dailyClean = num(
		db
			.prepare(
				`SELECT COUNT(*) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.date=? AND l.status='done' AND h.type='break'`
			)
			.get(date)
	);
	const dailyCategories = num(
		db
			.prepare(
				`SELECT COUNT(DISTINCT h.category) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.date=? AND l.status='done' AND h.type='build' AND h.category IS NOT NULL`
			)
			.get(date)
	);
	const dailyJournal = num(
		db.prepare(`SELECT COUNT(*) c FROM trigger_journal WHERE date(date)=?`).get(date)
	);
	const weeklyBuild = num(
		db
			.prepare(
				`SELECT COUNT(*) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.status='done' AND h.type='build' AND l.date BETWEEN ? AND ?`
			)
			.get(start, end)
	);
	const weeklyCleanDays = num(
		db
			.prepare(
				`SELECT COUNT(DISTINCT l.date) c FROM habit_logs l JOIN habits h ON h.id=l.habit_id
         WHERE l.status='done' AND h.type='break' AND l.date BETWEEN ? AND ?`
			)
			.get(start, end)
	);
	const weeklyVarietyDays = num(
		db
			.prepare(
				`SELECT COUNT(*) c FROM (
           SELECT l.date, COUNT(DISTINCT h.category) cc FROM habit_logs l JOIN habits h ON h.id=l.habit_id
           WHERE l.status='done' AND h.type='build' AND h.category IS NOT NULL AND l.date BETWEEN ? AND ?
           GROUP BY l.date HAVING cc>=2
         )`
			)
			.get(start, end)
	);
	const weeklyJournal = num(
		db
			.prepare(`SELECT COUNT(*) c FROM trigger_journal WHERE date(date) BETWEEN ? AND ?`)
			.get(start, end)
	);
	const relapses =
		num(
			db
				.prepare(`SELECT COUNT(*) c FROM habit_logs WHERE status='relapsed' AND date BETWEEN ? AND ?`)
				.get(start, end)
		) +
		num(
			db
				.prepare(`SELECT COUNT(*) c FROM trigger_journal WHERE gave_in=1 AND date(date) BETWEEN ? AND ?`)
				.get(start, end)
		);

	let maxCurrentStreak = 0;
	for (const h of listHabits()) {
		if (h.type !== 'build') continue;
		if (h.frequency_type === 'weekly') continue; // série quotidienne non pertinente pour un quota hebdo
		const s = computeHabitStreaks(h.id, date).current;
		if (s > maxCurrentStreak) maxCurrentStreak = s;
	}

	return {
		dailyBuild,
		dailyClean,
		dailyCategories,
		dailyJournal,
		weeklyBuild,
		weeklyCleanDays,
		weeklyVarietyDays,
		weeklyJournal,
		weeklyNoRelapse: relapses === 0,
		maxCurrentStreak
	};
}

function progressFor(q: Quest, a: Aggregates): number {
	// Cas particuliers par clé
	if (q.key === 'w_no_relapse') return a.weeklyNoRelapse ? 1 : 0;
	if (q.key === 'd_streak_keep') return a.maxCurrentStreak > 0 ? 1 : 0;

	if (q.scope === 'daily') {
		switch (q.kind) {
			case 'build':
				return a.dailyBuild;
			case 'clean':
				return a.dailyClean;
			case 'variety':
				return a.dailyCategories;
			case 'journaling':
				return a.dailyJournal;
			case 'streak':
				return a.maxCurrentStreak > 0 ? 1 : 0;
			case 'sos':
				return 0; // avancé à l'étape 7 (journal/SOS)
		}
	} else {
		switch (q.kind) {
			case 'build':
				return a.weeklyBuild;
			case 'clean':
				return a.weeklyCleanDays;
			case 'variety':
				return a.weeklyVarietyDays;
			case 'journaling':
				return a.weeklyJournal;
			case 'streak':
				return a.maxCurrentStreak;
			case 'sos':
				return 0;
		}
	}
	return q.progress;
}

/** Recalcule la progression de toutes les quêtes actives. Renvoie les quêtes à jour. */
export function recomputeQuestProgress(date: string = localDate()): Quest[] {
	const agg = computeAggregates(date);
	for (const q of getCurrentQuests(date)) {
		if (q.completed) continue;
		const p = Math.min(q.target, progressFor(q, agg));
		if (p !== q.progress) setQuestProgress(q.id, p);
	}
	return getCurrentQuests(date);
}
