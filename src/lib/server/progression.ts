// src/lib/server/progression.ts
// Moteur d'orchestration : applique une validation d'habitude (XP/pièces/séries,
// montées de niveau) dans UNE transaction. Les quêtes et succès sont branchés à
// l'étape 5 (voir les emplacements marqués TODO étape 5).
import {
	getDb,
	getHabit,
	getHabitLog,
	getHabitLogDates,
	upsertHabitLog,
	deleteHabitLog,
	addXp,
	addCoins,
	setLastActive,
	getUserState,
	logLevelEvent
} from './db';
import { currentStreakFromDates } from './streaks';
import { PROGRESSION, levelFromXp, xpWithStreak } from '../config/progression';
import { COIN_ECONOMY, coinsForLevelUp } from '../config/shop';
import type { HabitStatus, LevelInfo, ProgressDelta, LogResult, UserStateRow } from '../types';

/** Construit le view-model LevelInfo à partir de l'état utilisateur. */
export function levelInfoFromState(user: UserStateRow): LevelInfo {
	const li = levelFromXp(user.total_xp);
	const progressPct = li.needed > 0 ? Math.min(100, Math.round((li.intoLevel / li.needed) * 100)) : 0;
	return {
		level: li.level,
		intoLevel: li.intoLevel,
		needed: li.needed,
		totalXp: user.total_xp,
		progressPct,
		prestige: user.prestige,
		canPrestige: li.level >= PROGRESSION.PRESTIGE_LEVEL
	};
}

/**
 * Valide (ou re-valide) une habitude pour `date`. Idempotent : re-loguer le
 * même statut ne re-crédite rien (deltas nets). Renvoie l'état autoritaire pour
 * que le client réconcilie son optimisme.
 */
export function logHabit(
	habitId: number,
	date: string,
	status: HabitStatus = 'done',
	note: string | null = null
): LogResult {
	const db = getDb();
	return db.transaction((): LogResult => {
		const habit = getHabit(habitId);
		if (!habit) throw new Error('HABIT_NOT_FOUND');

		const prior = getHabitLog(habitId, date);
		const prevXp = prior?.xp_awarded ?? 0;
		const prevCoins = prior?.coins_awarded ?? 0;

		// Série AVANT l'action (on exclut la date courante du jeu de jours "done").
		const doneExcl = getHabitLogDates(habitId, 'done').filter((d) => d !== date);
		const preStreak = currentStreakFromDates(doneExcl, date);

		let baseXp = 0;
		let coinsAwarded = 0;
		let resultingStreak = 0;
		if (status === 'done') {
			baseXp =
				(habit.type === 'break' ? PROGRESSION.XP_BREAK_HABIT_DAY : PROGRESSION.XP_PER_HABIT) *
				habit.difficulty;
			coinsAwarded = habit.type === 'break' ? COIN_ECONOMY.PER_CLEAN_DAY : COIN_ECONOMY.PER_HABIT;
			resultingStreak = preStreak + 1;
		}
		const xpAwarded = status === 'done' ? xpWithStreak(baseXp, preStreak) : 0;

		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;

		// Écrit le log puis applique le changement NET (anti double-comptage).
		const log = upsertHabitLog({ habitId, date, status, note, xpAwarded, coinsAwarded });
		const newTotalXp = addXp(xpAwarded - prevXp);
		addCoins(coinsAwarded - prevCoins);
		setLastActive(date);

		const levelAfter = levelFromXp(newTotalXp).level;
		const leveledUp = levelAfter > levelBefore;
		let levelUpCoins = 0;
		if (leveledUp) {
			for (let l = levelBefore + 1; l <= levelAfter; l++) levelUpCoins += coinsForLevelUp(l);
			addCoins(levelUpCoins);
			logLevelEvent('level_up', levelBefore, levelAfter, before.prestige);
		}

		// TODO étape 5 : faire progresser les quêtes (par `kind`) + vérifier les succès.
		const unlockedAchievements: ProgressDelta['unlockedAchievements'] = [];
		const completedQuests: ProgressDelta['completedQuests'] = [];

		const after = getUserState();
		const delta: ProgressDelta = {
			xpGained: xpAwarded - prevXp,
			coinsGained: coinsAwarded - prevCoins + levelUpCoins,
			totalXp: after.total_xp,
			coins: after.coins,
			freezes: after.freezes,
			leveledUp,
			newLevel: leveledUp ? levelAfter : null,
			level: levelInfoFromState(after),
			streakDays: resultingStreak,
			unlockedAchievements,
			completedQuests
		};
		return { log, delta, levelBefore, levelAfter };
	})();
}

/** Annule une validation du même jour (un-tap) : retire le log et l'XP/pièces. */
export function reverseHabitLog(habitId: number, date: string): ProgressDelta {
	const db = getDb();
	return db.transaction((): ProgressDelta => {
		const prior = getHabitLog(habitId, date);
		if (prior) {
			addXp(-prior.xp_awarded);
			addCoins(-prior.coins_awarded);
			deleteHabitLog(habitId, date);
		}
		const after = getUserState();
		const streak = currentStreakFromDates(getHabitLogDates(habitId, 'done'), date);
		return {
			xpGained: prior ? -prior.xp_awarded : 0,
			coinsGained: prior ? -prior.coins_awarded : 0,
			totalXp: after.total_xp,
			coins: after.coins,
			freezes: after.freezes,
			leveledUp: false,
			newLevel: null,
			level: levelInfoFromState(after),
			streakDays: streak,
			unlockedAchievements: [],
			completedQuests: []
		};
	})();
}
