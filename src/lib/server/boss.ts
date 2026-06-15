// src/lib/server/boss.ts — état dérivé du boss (HP = jours cibles, 1 jour clean = 1 PV).
import { BOSS } from '../config/boss';
import { computeCleanStreak } from './streaks';
import { getDb, localDate, getAddictionTarget, markBossDefeated, addCoins, getUserState } from './db';
import { runAchievementChecks } from './achievements';
import { applyLevelUp } from './progression';
import { levelFromXp } from '../config/progression';
import type { AddictionTarget, AddictionKind, BossMode, DailyCheckin } from '../types';

export type BossTier = 'colossal' | 'affaibli' | 'vacillant' | 'agonisant' | 'vaincu';

export interface BossState {
	id: number;
	name: string;
	icon: string;
	kind: AddictionKind;
	cleanDays: number;
	targetDays: number;
	hpRemaining: number;
	hpFraction: number;
	bestStreakDays: number;
	defeated: boolean;
	defeatedAt: string | null;
	tier: BossTier;
	// argent (substances)
	moneySaved: number;
	moneyPerDay: number;
	trackMoney: boolean;
	// temps (comportementaux)
	timeReclaimed: number;   // minutes (estimation motivante)
	baselineMinutesPerDay: number;
	trackTime: boolean;
	// mode & règles
	mode: BossMode;
	dailyLimitMinutes: number | null;
	noUseBefore: string | null;
	// état du jour (check-in)
	todayCheckin: Pick<DailyCheckin, 'id' | 'minutes_used' | 'respected_no_before'> | null;
	// navigation
	cleanSince: string | null;
	nextMilestoneDays: number | null;
}

const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730];

export function nextMilestone(cleanDays: number): number | null {
	return MILESTONES.find((m) => m > cleanDays) ?? null;
}

export function bossTier(hpFraction: number, defeated: boolean): BossTier {
	if (defeated) return 'vaincu';
	if (hpFraction > 0.66) return 'colossal';
	if (hpFraction > 0.4) return 'affaibli';
	if (hpFraction > 0.15) return 'vacillant';
	return 'agonisant';
}

/** needsCheckin : true si le boss a une règle limit ou no_use_before (self-report journalier). */
export function bossNeedsCheckin(row: AddictionTarget): boolean {
	return row.mode === 'limit' || row.no_use_before != null;
}

export function computeBossState(
	row: AddictionTarget,
	today: string = localDate(),
	todayCheckin: Pick<DailyCheckin, 'id' | 'minutes_used' | 'respected_no_before'> | null = null
): BossState {
	const clean = computeCleanStreak(row, today);
	const cleanDays = clean.currentDays;
	const targetDays = Math.max(BOSS.MIN_TARGET, Math.min(BOSS.MAX_TARGET, row.target_streak_days));
	const hpRemaining = Math.max(0, targetDays - cleanDays);
	const hpFraction = targetDays > 0 ? Math.min(1, Math.max(0, hpRemaining / targetDays)) : 0;
	const defeated = cleanDays >= targetDays || row.defeated_at != null;

	// Temps repris (estimation)
	const baseline = row.baseline_minutes_per_day;
	let timeReclaimed = 0;
	if (row.track_time && baseline > 0) {
		if (row.mode === 'abstinence') {
			timeReclaimed = cleanDays * baseline;
		} else {
			// limit : on estime les minutes économisées par jour réussi
			const savedPerDay = Math.max(0, baseline - (row.daily_limit_minutes ?? 0));
			timeReclaimed = cleanDays * savedPerDay;
		}
	}

	return {
		id: row.id,
		name: row.name,
		icon: row.icon ?? BOSS.DEFAULT_ICON,
		kind: (row.kind ?? 'autre') as AddictionKind,
		cleanDays,
		targetDays,
		hpRemaining,
		hpFraction,
		bestStreakDays: Math.max(row.best_streak_days, cleanDays),
		defeated,
		defeatedAt: row.defeated_at,
		tier: bossTier(hpFraction, defeated),
		moneySaved: clean.moneySaved,
		moneyPerDay: row.money_per_day,
		trackMoney: Boolean(row.track_money),
		timeReclaimed,
		baselineMinutesPerDay: baseline,
		trackTime: Boolean(row.track_time),
		mode: row.mode,
		dailyLimitMinutes: row.daily_limit_minutes,
		noUseBefore: row.no_use_before,
		todayCheckin,
		cleanSince: row.clean_since,
		nextMilestoneDays: defeated ? null : nextMilestone(cleanDays)
	};
}

export function defeatBoss(id: number): { coinsAwarded: number; unlocked: ReturnType<typeof runAchievementChecks> } | null {
	const db = getDb();
	return db.transaction(() => {
		const before = getAddictionTarget(id);
		if (!before || before.defeated_at) return null;
		const levelBefore = levelFromXp(getUserState().total_xp).level;
		const target = markBossDefeated(id);
		if (!target) return null;
		const coinsAwarded = target.target_streak_days * BOSS.VICTORY_COIN_BONUS_PER_TARGET_DAY;
		addCoins(coinsAwarded);
		const unlocked = runAchievementChecks();
		const levelAfter = levelFromXp(getUserState().total_xp).level;
		applyLevelUp(levelBefore, levelAfter, getUserState().prestige);
		return { coinsAwarded, unlocked };
	})();
}
