// src/lib/server/progression.ts
// Moteur d'orchestration : applique une validation d'habitude (XP/pièces/séries,
// quêtes, succès, montées de niveau) dans UNE transaction.
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
	logLevelEvent,
	isoWeek,
	weekBounds,
	countDoneInRange,
	getWeeklyAward,
	insertWeeklyAward,
	deleteWeeklyAward,
	getOneTimeTask,
	markOneTimeTaskDone,
	markOneTimeTaskTodo
} from './db';
import { currentStreakFromDates, weeklyStatus, weeklyStreakBefore } from './streaks';
import { recomputeQuestProgress } from './quests';
import { runAchievementChecks } from './achievements';
import { PROGRESSION, levelFromXp, xpWithStreak, xpWithWeeklyStreak, oneTimeTaskXp } from '../config/progression';
import { COIN_ECONOMY, coinsForLevelUp, coinsForOneTimeTask } from '../config/shop';
import type {
	HabitStatus,
	LevelInfo,
	ProgressDelta,
	LogResult,
	UserStateRow,
	Habit,
	WeeklyStatus,
	Achievement,
	OneTimeTaskResult
} from '../types';

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

/** Crédite des pièces de montée de niveau et journalise l'événement. */
export function applyLevelUp(levelBefore: number, levelAfter: number, prestige: number): void {
	if (levelAfter <= levelBefore) return;
	let coins = 0;
	for (let l = levelBefore + 1; l <= levelAfter; l++) coins += coinsForLevelUp(l);
	addCoins(coins);
	logLevelEvent('level_up', levelBefore, levelAfter, prestige);
}

/** Annule symétriquement la/les montée(s) de niveau induites par un retrait d'XP
 *  (sinon tap/un-tap autour d'un palier farmerait des pièces). À appeler après
 *  avoir retiré l'XP, dans la même transaction. */
function reverseLevelDrop(levelBefore: number): void {
	const levelAfter = levelFromXp(getUserState().total_xp).level;
	if (levelAfter < levelBefore) {
		let coins = 0;
		for (let l = levelAfter + 1; l <= levelBefore; l++) coins += coinsForLevelUp(l);
		addCoins(-coins);
		getDb()
			.prepare(`DELETE FROM level_events WHERE type='level_up' AND seen=0 AND to_level > ?`)
			.run(levelAfter);
	}
}

/** Fabrique un ProgressDelta à partir des états avant/après (facteur commun). */
function buildProgressDelta(
	before: UserStateRow,
	final: UserStateRow,
	levelBefore: number,
	levelAfter: number,
	opts: {
		streakDays?: number;
		weekly?: WeeklyStatus | null;
		weeklyQuotaJustMet?: boolean;
		unlockedAchievements?: Achievement[];
	} = {}
): ProgressDelta {
	return {
		xpGained: final.total_xp - before.total_xp,
		coinsGained: final.coins - before.coins,
		totalXp: final.total_xp,
		coins: final.coins,
		freezes: final.freezes,
		leveledUp: levelAfter > levelBefore,
		newLevel: levelAfter > levelBefore ? levelAfter : null,
		level: levelInfoFromState(final),
		streakDays: opts.streakDays ?? 0,
		weekly: opts.weekly ?? null,
		weeklyQuotaJustMet: opts.weeklyQuotaJustMet ?? false,
		unlockedAchievements: opts.unlockedAchievements ?? [],
		completedQuests: []
	};
}

/**
 * Réconcilie le bonus de quota hebdomadaire pour la semaine de `date`.
 * Idempotent et indépendant de l'ordre : crédite le bonus la 1re fois que le
 * quota est atteint, l'annule si le compte repasse sous le quota (un-tap).
 * Doit être appelé après l'upsert/suppression du log, dans la transaction.
 */
function reconcileWeeklyQuota(habit: Habit, date: string): { weekly: WeeklyStatus; justMet: boolean } {
	const quota = Math.max(1, habit.weekly_quota);
	const week = isoWeek(date);
	const { start, end } = weekBounds(date);
	const count = countDoneInRange(habit.id, start, end);
	const existing = getWeeklyAward(habit.id, week);
	let justMet = false;

	if (count >= quota && !existing) {
		const weeksBefore = weeklyStreakBefore(habit.id, quota, date);
		const bonusXp = xpWithWeeklyStreak(PROGRESSION.XP_WEEKLY_QUOTA_BONUS * habit.difficulty, weeksBefore);
		const bonusCoins = COIN_ECONOMY.WEEKLY_QUOTA_BONUS;
		addXp(bonusXp);
		addCoins(bonusCoins);
		insertWeeklyAward(habit.id, week, quota, bonusXp, bonusCoins);
		justMet = true;
	} else if (existing && count < existing.quota) {
		// On ne reprend le bonus que si les check-ins repassent sous le quota
		// EN VIGUEUR À L'OCTROI (un-tap) — relever le quota après coup ne punit pas.
		addXp(-existing.bonus_xp);
		addCoins(-existing.bonus_coins);
		deleteWeeklyAward(habit.id, week);
	}

	return { weekly: weeklyStatus(habit.id, quota, date), justMet };
}

/**
 * Valide (ou re-valide) une habitude pour `date`. Idempotent (deltas nets).
 * Fait progresser les quêtes et vérifie les succès. Renvoie l'état autoritaire.
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

		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;

		const prior = getHabitLog(habitId, date);
		const prevXp = prior?.xp_awarded ?? 0;
		const prevCoins = prior?.coins_awarded ?? 0;

		const isWeekly = habit.frequency_type === 'weekly';

		let xpAwarded = 0;
		let coinsAwarded = 0;
		let resultingStreak = 0; // série quotidienne (habitudes 'daily')
		if (status === 'done') {
			if (isWeekly) {
				// Objectif hebdo : petit gain par check-in, sans bonus de série quotidienne.
				// Le bonus d'atteinte du quota est géré par reconcileWeeklyQuota (registre).
				xpAwarded = PROGRESSION.XP_WEEKLY_CHECKIN * habit.difficulty;
				coinsAwarded = COIN_ECONOMY.PER_WEEKLY_CHECKIN;
			} else {
				// Habitude quotidienne : série AVANT l'action (on exclut la date courante).
				const doneExcl = getHabitLogDates(habitId, 'done').filter((d) => d !== date);
				const preStreak = currentStreakFromDates(doneExcl, date);
				const baseXp =
					(habit.type === 'break' ? PROGRESSION.XP_BREAK_HABIT_DAY : PROGRESSION.XP_PER_HABIT) *
					habit.difficulty;
				xpAwarded = xpWithStreak(baseXp, preStreak);
				coinsAwarded = habit.type === 'break' ? COIN_ECONOMY.PER_CLEAN_DAY : COIN_ECONOMY.PER_HABIT;
				resultingStreak = preStreak + 1;
			}
		}

		const log = upsertHabitLog({ habitId, date, status, note, xpAwarded, coinsAwarded });
		addXp(xpAwarded - prevXp);
		addCoins(coinsAwarded - prevCoins);
		setLastActive(date);

		// Objectifs hebdo : réconcilie le bonus de quota (avant le calcul de niveau).
		let weekly: WeeklyStatus | null = null;
		let weeklyQuotaJustMet = false;
		if (isWeekly) {
			const r = reconcileWeeklyQuota(habit, date);
			weekly = r.weekly;
			weeklyQuotaJustMet = r.justMet;
			resultingStreak = r.weekly.streak; // la « flamme » d'un objectif hebdo compte en semaines
		}

		// Quêtes : recalcul de progression (récompense réclamée manuellement).
		recomputeQuestProgress(date);

		// Succès : déblocage + crédit des récompenses (peut ajouter XP/pièces).
		const unlockedAchievements = runAchievementChecks(date);

		// Montée(s) de niveau (couvre l'XP habitude + bonus hebdo + XP des succès).
		const afterXp = getUserState();
		const levelAfter = levelFromXp(afterXp.total_xp).level;
		applyLevelUp(levelBefore, levelAfter, before.prestige);

		const final = getUserState();
		const delta = buildProgressDelta(before, final, levelBefore, levelAfter, {
			streakDays: resultingStreak,
			weekly,
			weeklyQuotaJustMet,
			unlockedAchievements
		});
		return { log, delta, levelBefore, levelAfter };
	})();
}

/** Annule une validation du même jour (un-tap) : retire le log et l'XP/pièces. */
export function reverseHabitLog(habitId: number, date: string): ProgressDelta {
	const db = getDb();
	return db.transaction((): ProgressDelta => {
		const habit = getHabit(habitId);
		const prior = getHabitLog(habitId, date);
		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;

		if (prior) {
			addXp(-prior.xp_awarded);
			addCoins(-prior.coins_awarded);
			deleteHabitLog(habitId, date);
		}

		// Objectifs hebdo : retirer ce jour peut faire repasser sous le quota → annule le bonus.
		let weekly: WeeklyStatus | null = null;
		const isWeekly = habit?.frequency_type === 'weekly';
		if (habit && isWeekly) {
			weekly = reconcileWeeklyQuota(habit, date).weekly;
		}

		// Annule symétriquement la/les montée(s) de niveau induites (log + bonus hebdo).
		reverseLevelDrop(levelBefore);

		recomputeQuestProgress(date);
		const after = getUserState();
		const streak = isWeekly
			? (weekly?.streak ?? 0)
			: currentStreakFromDates(getHabitLogDates(habitId, 'done'), date);
		return buildProgressDelta(before, after, levelBefore, levelBefore, {
			streakDays: streak,
			weekly
		});
	})();
}

/** Crédite une récompense (quête, etc.) avec gestion niveau + succès. */
export function grantRewards(xp: number, coins: number): ProgressDelta {
	const db = getDb();
	return db.transaction((): ProgressDelta => {
		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;
		addXp(xp);
		addCoins(coins);
		const unlockedAchievements = runAchievementChecks();
		const afterXp = getUserState();
		const levelAfter = levelFromXp(afterXp.total_xp).level;
		applyLevelUp(levelBefore, levelAfter, before.prestige);
		const final = getUserState();
		return buildProgressDelta(before, final, levelBefore, levelAfter, { unlockedAchievements });
	})();
}

// =========================================================================
//  Tâches ponctuelles (Feature 1) — XP créditée une seule fois, réversible.
// =========================================================================

/** Marque une tâche ponctuelle comme faite : crédite l'XP/pièces UNE fois,
 *  gère succès + montée de niveau. Idempotent (re-coche d'une tâche déjà faite). */
export function completeOneTimeTask(id: number): OneTimeTaskResult | null {
	const db = getDb();
	return db.transaction((): OneTimeTaskResult | null => {
		const task = getOneTimeTask(id);
		if (!task) return null;
		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;
		if (task.status === 'done') {
			// Déjà créditée : aucun double-compte.
			return { task, delta: buildProgressDelta(before, before, levelBefore, levelBefore) };
		}

		const xp = oneTimeTaskXp(task.difficulty);
		const coins = coinsForOneTimeTask(task.difficulty);
		addXp(xp);
		addCoins(coins);
		markOneTimeTaskDone(id, xp, coins);

		const unlockedAchievements = runAchievementChecks();
		const afterXp = getUserState();
		const levelAfter = levelFromXp(afterXp.total_xp).level;
		applyLevelUp(levelBefore, levelAfter, before.prestige);

		const final = getUserState();
		const delta = buildProgressDelta(before, final, levelBefore, levelAfter, { unlockedAchievements });
		return { task: getOneTimeTask(id)!, delta };
	})();
}

/** Ré-ouvre une tâche ponctuelle (annulation) : retire l'XP/pièces créditées
 *  et annule symétriquement une éventuelle montée de niveau (anti-farm). */
export function reopenOneTimeTask(id: number): OneTimeTaskResult | null {
	const db = getDb();
	return db.transaction((): OneTimeTaskResult | null => {
		const task = getOneTimeTask(id);
		if (!task) return null;
		const before = getUserState();
		const levelBefore = levelFromXp(before.total_xp).level;
		if (task.status !== 'done') {
			return { task, delta: buildProgressDelta(before, before, levelBefore, levelBefore) };
		}

		addXp(-task.xp_awarded);
		addCoins(-task.coins_awarded);
		markOneTimeTaskTodo(id);
		reverseLevelDrop(levelBefore);

		const final = getUserState();
		// levelBefore==levelBefore → leveledUp=false (pas de fausse célébration).
		const delta = buildProgressDelta(before, final, levelBefore, levelBefore);
		return { task: getOneTimeTask(id)!, delta };
	})();
}
