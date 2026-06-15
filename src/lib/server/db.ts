// src/lib/server/db.ts
// One shared synchronous SQLite connection (better-sqlite3). Owns pragmas,
// migrations and idempotent content seeding. Engines (progression/quests/…)
// call these primitives. Uses RELATIVE imports + process.env so the seed
// script (run via tsx, outside SvelteKit) can import this module directly.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrations';
import { PROGRESSION, levelFromXp } from '../config/progression';
import type {
	UserStateRow,
	Habit,
	HabitLog,
	HabitStatus,
	Quest,
	QuestKind,
	QuestScope,
	Achievement,
	Reward,
	RewardKind,
	AddictionTarget,
	DailyCheckin,
	TriggerEntry,
	PushSubscriptionRow,
	OwnedCosmetic,
	LevelEvent,
	LevelEventType,
	NewHabit,
	HabitPatch,
	NewReward,
	NewAddictionTarget,
	NewTriggerEntry,
	WebPushKeys,
	CosmeticSlot
} from '../types';

// =========================================================================
//  Connection / init
// =========================================================================
let _db: Database.Database | null = null;

export function dbPath(): string {
	const p = process.env.DB_PATH ?? './data/habitquest.db';
	mkdirSync(dirname(p), { recursive: true });
	return p;
}

export function getDb(): Database.Database {
	if (_db) return _db;
	_db = new Database(dbPath());
	_db.pragma('journal_mode = WAL');
	_db.pragma('foreign_keys = ON');
	_db.pragma('busy_timeout = 5000');
	_db.pragma('synchronous = NORMAL');
	runMigrations(_db);
	return _db;
}

export function initDb(): void {
	getDb();
	if (getSetting('reminder_hour') === null) setSetting('reminder_hour', 20);
}

export function closeDb(): void {
	if (_db) {
		_db.close();
		_db = null;
	}
}

// =========================================================================
//  Date / period helpers
// =========================================================================
export function localDate(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function localDateTime(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${localDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function previousDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() - 1);
	return localDate(dt);
}

export function nextDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() + 1);
	return localDate(dt);
}

export function daysBetween(a: string, b: string): number {
	const [ay, am, ad] = a.split('-').map(Number);
	const [by, bm, bd] = b.split('-').map(Number);
	return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function isoWeek(date: string = localDate()): string {
	const [y, m, d] = date.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	const dayNum = (dt.getUTCDay() + 6) % 7;
	dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
	const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
	const week =
		1 +
		Math.round(
			((dt.getTime() - firstThursday.getTime()) / 86400000 -
				3 +
				((firstThursday.getUTCDay() + 6) % 7)) /
				7
		);
	return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '00')}`;
}

// =========================================================================
//  Settings
// =========================================================================
export function getSetting<T = unknown>(key: string): T | null {
	const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	return row ? (JSON.parse(row.value) as T) : null;
}
export function setSetting(key: string, value: unknown): void {
	getDb()
		.prepare(
			`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
		)
		.run(key, JSON.stringify(value));
}
export function getAllSettings(): Record<string, unknown> {
	const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
		key: string;
		value: string;
	}[];
	const out: Record<string, unknown> = {};
	for (const r of rows) out[r.key] = JSON.parse(r.value);
	return out;
}

// =========================================================================
//  User state
// =========================================================================
export function getUserState(): UserStateRow {
	return getDb().prepare('SELECT * FROM user_state WHERE id = 1').get() as UserStateRow;
}
export function addXp(delta: number): number {
	getDb().prepare('UPDATE user_state SET total_xp = MAX(0, total_xp + ?) WHERE id = 1').run(delta);
	return getUserState().total_xp;
}
export function addCoins(delta: number): number {
	getDb().prepare('UPDATE user_state SET coins = MAX(0, coins + ?) WHERE id = 1').run(delta);
	return getUserState().coins;
}
export function spendCoins(amount: number): boolean {
	const info = getDb()
		.prepare('UPDATE user_state SET coins = coins - ? WHERE id = 1 AND coins >= ?')
		.run(amount, amount);
	return info.changes === 1;
}
export function setFreezes(count: number): void {
	getDb().prepare('UPDATE user_state SET freezes = MAX(0, ?) WHERE id = 1').run(count);
}
export function consumeFreeze(): boolean {
	const info = getDb()
		.prepare('UPDATE user_state SET freezes = freezes - 1 WHERE id = 1 AND freezes > 0')
		.run();
	return info.changes === 1;
}
export function grantWeeklyFreezeIfDue(week: string): boolean {
	const info = getDb()
		.prepare(
			`UPDATE user_state
         SET freezes = MIN(?, freezes + 1), last_freeze_grant = ?
       WHERE id = 1 AND (last_freeze_grant IS NULL OR last_freeze_grant <> ?)`
		)
		.run(PROGRESSION.FREEZES_MAX, week, week);
	return info.changes === 1;
}
export function setLastActive(date: string): void {
	getDb().prepare('UPDATE user_state SET last_active = ? WHERE id = 1').run(date);
}

const SLOT_TO_COLUMN: Record<CosmeticSlot, string> = {
	theme:       'equipped_theme_id',
	avatar_skin: 'equipped_skin_id',
	accessory:   'equipped_accessory_id',
	badge_frame: 'equipped_frame_id'
};

export function setEquippedCosmeticForSlot(rewardId: number | null, slot: CosmeticSlot): void {
	const col = SLOT_TO_COLUMN[slot];
	// col comes from a controlled map — safe to interpolate
	getDb().prepare(`UPDATE user_state SET ${col} = ? WHERE id = 1`).run(rewardId);
}

export function prestige(): number | null {
	const db = getDb();
	return db.transaction((): number | null => {
		const s = getUserState();
		const { level } = levelFromXp(s.total_xp);
		if (level < PROGRESSION.PRESTIGE_LEVEL) return null;
		const newPrestige = s.prestige + 1;
		db.prepare('UPDATE user_state SET total_xp = 0, prestige = ? WHERE id = 1').run(newPrestige);
		logLevelEvent('prestige', level, 1, newPrestige);
		return newPrestige;
	})();
}

// =========================================================================
//  Level events
// =========================================================================
export function logLevelEvent(
	type: LevelEventType,
	fromLevel: number,
	toLevel: number,
	prestigeLevel: number
): void {
	getDb()
		.prepare(
			`INSERT INTO level_events (type, from_level, to_level, prestige) VALUES (?, ?, ?, ?)`
		)
		.run(type, fromLevel, toLevel, prestigeLevel);
}
export function getUnseenLevelEvents(): LevelEvent[] {
	return getDb()
		.prepare('SELECT * FROM level_events WHERE seen = 0 ORDER BY id ASC')
		.all() as LevelEvent[];
}
export function markLevelEventsSeen(ids: number[]): void {
	if (ids.length === 0) return;
	const placeholders = ids.map(() => '?').join(',');
	getDb()
		.prepare(`UPDATE level_events SET seen = 1 WHERE id IN (${placeholders})`)
		.run(...ids);
}

// =========================================================================
//  Habits — CRUD + lists
// =========================================================================
export function createHabit(input: NewHabit): Habit {
	const db = getDb();
	const maxOrder =
		(db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits').get() as { m: number }).m ??
		0;
	const info = db
		.prepare(
			`INSERT INTO habits (name, type, category, difficulty, icon, sort_order)
       VALUES (@name, @type, @category, @difficulty, @icon, @sort_order)`
		)
		.run({
			name: input.name,
			type: input.type,
			category: input.category ?? null,
			difficulty: input.difficulty ?? 1,
			icon: input.icon ?? null,
			sort_order: maxOrder + 1
		});
	return getHabit(Number(info.lastInsertRowid))!;
}
export function getHabit(id: number): Habit | null {
	return (getDb().prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit) ?? null;
}
export function updateHabit(id: number, patch: HabitPatch): Habit | null {
	const h = getHabit(id);
	if (!h) return null;
	const merged = {
		name: patch.name ?? h.name,
		type: patch.type ?? h.type,
		category: patch.category !== undefined ? patch.category : h.category,
		difficulty: patch.difficulty ?? h.difficulty,
		icon: patch.icon !== undefined ? patch.icon : h.icon,
		sort_order: patch.sort_order ?? h.sort_order,
		archived: patch.archived !== undefined ? (patch.archived ? 1 : 0) : h.archived,
		id
	};
	getDb()
		.prepare(
			`UPDATE habits SET name=@name, type=@type, category=@category, difficulty=@difficulty,
         icon=@icon, sort_order=@sort_order, archived=@archived WHERE id=@id`
		)
		.run(merged);
	return getHabit(id);
}
export function archiveHabit(id: number, archived = true): void {
	getDb().prepare('UPDATE habits SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}
export function deleteHabit(id: number): void {
	getDb().prepare('DELETE FROM habits WHERE id = ?').run(id);
}
export function listHabits(opts?: { archived?: boolean }): Habit[] {
	const archived = opts?.archived ? 1 : 0;
	return getDb()
		.prepare('SELECT * FROM habits WHERE archived = ? ORDER BY sort_order ASC, id ASC')
		.all(archived) as Habit[];
}
export function reorderHabits(orderedIds: number[]): void {
	const db = getDb();
	const stmt = db.prepare('UPDATE habits SET sort_order = ? WHERE id = ?');
	db.transaction(() => {
		orderedIds.forEach((id, i) => stmt.run(i + 1, id));
	})();
}

// =========================================================================
//  Habit logs
// =========================================================================
export function upsertHabitLog(args: {
	habitId: number;
	date: string;
	status: HabitStatus;
	note?: string | null;
	xpAwarded: number;
	coinsAwarded: number;
}): HabitLog {
	getDb()
		.prepare(
			`INSERT INTO habit_logs (habit_id, date, status, note, xp_awarded, coins_awarded)
       VALUES (@habitId, @date, @status, @note, @xpAwarded, @coinsAwarded)
       ON CONFLICT(habit_id, date) DO UPDATE SET
         status = excluded.status, note = excluded.note,
         xp_awarded = excluded.xp_awarded, coins_awarded = excluded.coins_awarded,
         logged_at = datetime('now')`
		)
		.run({ ...args, note: args.note ?? null });
	return getHabitLog(args.habitId, args.date)!;
}
export function getHabitLog(habitId: number, date: string): HabitLog | null {
	return (
		(getDb()
			.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?')
			.get(habitId, date) as HabitLog) ?? null
	);
}
export function deleteHabitLog(habitId: number, date: string): boolean {
	return (
		getDb().prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(habitId, date)
			.changes > 0
	);
}
export function getHabitLogDates(habitId: number, status?: HabitStatus): string[] {
	const rows = status
		? getDb()
				.prepare('SELECT date FROM habit_logs WHERE habit_id = ? AND status = ? ORDER BY date ASC')
				.all(habitId, status)
		: getDb()
				.prepare('SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date ASC')
				.all(habitId);
	return (rows as { date: string }[]).map((r) => r.date);
}
export function getLogsForDate(date: string): HabitLog[] {
	return getDb().prepare('SELECT * FROM habit_logs WHERE date = ?').all(date) as HabitLog[];
}
export function countLogsForDate(date: string, status: HabitStatus): number {
	return (
		getDb()
			.prepare('SELECT COUNT(*) AS c FROM habit_logs WHERE date = ? AND status = ?')
			.get(date, status) as { c: number }
	).c;
}

// =========================================================================
//  Quests
// =========================================================================
export function upsertQuest(args: {
	scope: QuestScope;
	kind: QuestKind;
	key: string;
	description: string;
	target: number;
	rewardXp: number;
	rewardCoins: number;
	period: string;
}): Quest {
	const db = getDb();
	db.prepare(
		`INSERT INTO quests (scope, kind, key, description, target, reward_xp, reward_coins, period)
     VALUES (@scope, @kind, @key, @description, @target, @rewardXp, @rewardCoins, @period)
     ON CONFLICT(period, key) DO NOTHING`
	).run(args);
	return db
		.prepare('SELECT * FROM quests WHERE period = ? AND key = ?')
		.get(args.period, args.key) as Quest;
}
export function listQuests(period: string, scope?: QuestScope): Quest[] {
	return scope
		? (getDb()
				.prepare('SELECT * FROM quests WHERE period = ? AND scope = ? ORDER BY id ASC')
				.all(period, scope) as Quest[])
		: (getDb().prepare('SELECT * FROM quests WHERE period = ? ORDER BY id ASC').all(period) as Quest[]);
}
export function getQuest(id: number): Quest | null {
	return (getDb().prepare('SELECT * FROM quests WHERE id = ?').get(id) as Quest) ?? null;
}
export function incrementQuestProgress(id: number, by: number): Quest | null {
	getDb()
		.prepare('UPDATE quests SET progress = MIN(target, progress + ?) WHERE id = ? AND completed = 0')
		.run(by, id);
	return getQuest(id);
}
export function setQuestProgress(id: number, value: number): Quest | null {
	getDb()
		.prepare('UPDATE quests SET progress = MIN(target, MAX(0, ?)) WHERE id = ? AND completed = 0')
		.run(value, id);
	return getQuest(id);
}
export function completeQuest(id: number): boolean {
	return (
		getDb()
			.prepare(`UPDATE quests SET completed = 1, completed_at = datetime('now') WHERE id = ? AND completed = 0`)
			.run(id).changes === 1
	);
}
export function pruneOldQuests(beforePeriod: string): number {
	return getDb()
		.prepare("DELETE FROM quests WHERE scope = 'daily' AND period < ?")
		.run(beforePeriod).changes;
}

// =========================================================================
//  Achievements
// =========================================================================
export function listAchievements(): Achievement[] {
	return getDb().prepare('SELECT * FROM achievements ORDER BY unlocked_at IS NULL, unlocked_at DESC').all() as Achievement[];
}
export function getAchievement(key: string): Achievement | null {
	return (getDb().prepare('SELECT * FROM achievements WHERE key = ?').get(key) as Achievement) ?? null;
}
export function seedAchievements(
	rows: Array<{ key: string; name: string; description?: string; icon?: string; reward_coins?: number }>
): void {
	const db = getDb();
	const stmt = db.prepare(
		`INSERT INTO achievements (key, name, description, icon, reward_coins)
     VALUES (@key, @name, @description, @icon, @reward_coins)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name, description = excluded.description,
       icon = excluded.icon, reward_coins = excluded.reward_coins`
	);
	db.transaction((rs: typeof rows) => {
		for (const r of rs)
			stmt.run({ description: null, icon: null, reward_coins: 0, ...r });
	})(rows);
}
export function unlockAchievement(key: string): Achievement | null {
	const info = getDb()
		.prepare(`UPDATE achievements SET unlocked_at = datetime('now') WHERE key = ? AND unlocked_at IS NULL`)
		.run(key);
	return info.changes === 1 ? getAchievement(key) : null;
}

// =========================================================================
//  Rewards (shop)
// =========================================================================
export function createReward(input: NewReward): Reward {
	const info = getDb()
		.prepare(
			`INSERT INTO rewards (name, cost, kind, category, asset_id, icon, description, min_level, repeatable)
       VALUES (@name, @cost, @kind, @category, @asset_id, @icon, @description, @min_level, @repeatable)`
		)
		.run({
			name: input.name,
			cost: input.cost,
			kind: input.kind,
			category: input.category ?? null,
			asset_id: input.asset_id ?? null,
			icon: input.icon ?? null,
			description: input.description ?? null,
			min_level: input.min_level ?? 1,
			repeatable: input.repeatable ? 1 : 0
		});
	return getReward(Number(info.lastInsertRowid))!;
}
export function getReward(id: number): Reward | null {
	return (getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Reward) ?? null;
}
export function updateReward(id: number, patch: Partial<NewReward>): Reward | null {
	const r = getReward(id);
	if (!r) return null;
	const merged = {
		name: patch.name ?? r.name,
		cost: patch.cost ?? r.cost,
		kind: patch.kind ?? r.kind,
		category: patch.category !== undefined ? patch.category : r.category,
		asset_id: patch.asset_id !== undefined ? patch.asset_id : r.asset_id,
		icon: patch.icon !== undefined ? patch.icon : r.icon,
		description: patch.description !== undefined ? patch.description : r.description,
		min_level: patch.min_level ?? r.min_level,
		repeatable: patch.repeatable !== undefined ? (patch.repeatable ? 1 : 0) : r.repeatable,
		id
	};
	getDb()
		.prepare(
			`UPDATE rewards SET name=@name, cost=@cost, kind=@kind, category=@category, asset_id=@asset_id,
         icon=@icon, description=@description, min_level=@min_level, repeatable=@repeatable WHERE id=@id`
		)
		.run(merged);
	return getReward(id);
}
export function deleteReward(id: number): void {
	getDb().prepare('DELETE FROM rewards WHERE id = ?').run(id);
}
export function listRewards(opts?: { kind?: RewardKind }): Reward[] {
	return opts?.kind
		? (getDb()
				.prepare('SELECT * FROM rewards WHERE kind = ? ORDER BY min_level ASC, cost ASC')
				.all(opts.kind) as Reward[])
		: (getDb().prepare('SELECT * FROM rewards ORDER BY min_level ASC, cost ASC').all() as Reward[]);
}
export function claimReward(id: number, currentLevel: number): Reward | null {
	const db = getDb();
	return db.transaction((): Reward | null => {
		const r = getReward(id);
		if (!r) return null;
		if (currentLevel < r.min_level) return null;
		if (!r.repeatable && r.claimed_at) return null;
		if (!spendCoins(r.cost)) return null;
		if (!r.repeatable) db.prepare(`UPDATE rewards SET claimed_at = datetime('now') WHERE id = ?`).run(id);
		if (r.kind === 'cosmetic')
			db.prepare('INSERT OR IGNORE INTO owned_cosmetics (reward_id) VALUES (?)').run(id);
		return getReward(id);
	})();
}
export function listOwnedCosmetics(): OwnedCosmetic[] {
	return getDb().prepare('SELECT * FROM owned_cosmetics').all() as OwnedCosmetic[];
}

// =========================================================================
//  Addiction targets ("boss")
// =========================================================================
export function createAddictionTarget(input: NewAddictionTarget): AddictionTarget {
	const info = getDb()
		.prepare(
			`INSERT INTO addiction_targets
         (name, clean_since, money_per_day, target_streak_days, kind, icon,
          mode, daily_limit_minutes, no_use_before, baseline_minutes_per_day, track_time, track_money)
       VALUES
         (@name, @clean_since, @money_per_day, @target_streak_days, @kind, @icon,
          @mode, @daily_limit_minutes, @no_use_before, @baseline_minutes_per_day, @track_time, @track_money)`
		)
		.run({
			name: input.name,
			clean_since: input.clean_since ?? null,
			money_per_day: input.money_per_day ?? 0,
			target_streak_days: input.target_streak_days ?? 90,
			kind: input.kind ?? null,
			icon: input.icon ?? null,
			mode: input.mode ?? 'abstinence',
			daily_limit_minutes: input.daily_limit_minutes ?? null,
			no_use_before: input.no_use_before ?? null,
			baseline_minutes_per_day: input.baseline_minutes_per_day ?? 0,
			track_time: input.track_time ? 1 : 0,
			track_money: input.track_money !== false ? 1 : 0
		});
	return getAddictionTarget(Number(info.lastInsertRowid))!;
}
export function getAddictionTarget(id: number): AddictionTarget | null {
	return (
		(getDb().prepare('SELECT * FROM addiction_targets WHERE id = ?').get(id) as AddictionTarget) ??
		null
	);
}
export function updateAddictionTarget(
	id: number,
	patch: Partial<NewAddictionTarget>
): AddictionTarget | null {
	const t = getAddictionTarget(id);
	if (!t) return null;
	const merged = {
		name: patch.name ?? t.name,
		clean_since: patch.clean_since !== undefined ? patch.clean_since : t.clean_since,
		money_per_day: patch.money_per_day ?? t.money_per_day,
		target_streak_days: patch.target_streak_days ?? t.target_streak_days,
		kind: patch.kind !== undefined ? patch.kind : t.kind,
		icon: patch.icon !== undefined ? patch.icon : t.icon,
		mode: patch.mode ?? t.mode,
		daily_limit_minutes: patch.daily_limit_minutes !== undefined ? patch.daily_limit_minutes : t.daily_limit_minutes,
		no_use_before: patch.no_use_before !== undefined ? patch.no_use_before : t.no_use_before,
		baseline_minutes_per_day: patch.baseline_minutes_per_day ?? t.baseline_minutes_per_day,
		track_time: patch.track_time !== undefined ? (patch.track_time ? 1 : 0) : t.track_time,
		track_money: patch.track_money !== undefined ? (patch.track_money ? 1 : 0) : t.track_money,
		id
	};
	getDb()
		.prepare(
			`UPDATE addiction_targets SET name=@name, clean_since=@clean_since, money_per_day=@money_per_day,
         target_streak_days=@target_streak_days, kind=@kind, icon=@icon, mode=@mode,
         daily_limit_minutes=@daily_limit_minutes, no_use_before=@no_use_before,
         baseline_minutes_per_day=@baseline_minutes_per_day, track_time=@track_time, track_money=@track_money
       WHERE id=@id`
		)
		.run(merged);
	return getAddictionTarget(id);
}
export function archiveAddictionTarget(id: number, archived = true): void {
	getDb().prepare('UPDATE addiction_targets SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}
export function deleteAddictionTarget(id: number): void {
	getDb().prepare('DELETE FROM addiction_targets WHERE id = ?').run(id);
}
export function listAddictionTargets(opts?: { archived?: boolean }): AddictionTarget[] {
	const archived = opts?.archived ? 1 : 0;
	return getDb()
		.prepare('SELECT * FROM addiction_targets WHERE archived = ? ORDER BY created_at ASC, id ASC')
		.all(archived) as AddictionTarget[];
}
export function markBossDefeated(id: number): AddictionTarget | null {
	const db = getDb();
	return db.transaction((): AddictionTarget | null => {
		const t = getAddictionTarget(id);
		if (!t) return null;
		if (t.clean_since) {
			const run = daysBetween(t.clean_since, localDate()) + 1;
			if (run > t.best_streak_days)
				db.prepare('UPDATE addiction_targets SET best_streak_days = ? WHERE id = ?').run(run, id);
		}
		db.prepare(`UPDATE addiction_targets SET defeated_at = datetime('now') WHERE id = ?`).run(id);
		return getAddictionTarget(id);
	})();
}
export function setCleanSince(id: number, date: string | null): AddictionTarget | null {
	const db = getDb();
	return db.transaction((): AddictionTarget | null => {
		const t = getAddictionTarget(id);
		if (!t) return null;
		if (t.clean_since && date === null) {
			const run = daysBetween(t.clean_since, localDate()) + 1;
			if (run > t.best_streak_days)
				db.prepare('UPDATE addiction_targets SET best_streak_days = ? WHERE id = ?').run(run, id);
		}
		db.prepare('UPDATE addiction_targets SET clean_since = ? WHERE id = ?').run(date, id);
		return getAddictionTarget(id);
	})();
}
export function relapse(
	id: number,
	date: string,
	useFreeze: boolean
): { target: AddictionTarget; usedFreeze: boolean } | null {
	const db = getDb();
	return db.transaction((): { target: AddictionTarget; usedFreeze: boolean } | null => {
		const t = getAddictionTarget(id);
		if (!t) return null;
		if (t.clean_since) {
			const run = daysBetween(t.clean_since, date) + 1;
			if (run > t.best_streak_days)
				db.prepare('UPDATE addiction_targets SET best_streak_days = ? WHERE id = ?').run(run, id);
		}
		let usedFreeze = false;
		if (useFreeze && consumeFreeze()) usedFreeze = true;
		else db.prepare('UPDATE addiction_targets SET clean_since = ? WHERE id = ?').run(date, id);
		return { target: getAddictionTarget(id)!, usedFreeze };
	})();
}

// =========================================================================
//  Daily check-ins (self-report pour les boss limit / no_use_before)
// =========================================================================
export function insertCheckin(input: {
	targetId: number;
	date: string;
	minutesUsed?: number | null;
	respectNoUseBefore?: boolean | null;
	coinsAwarded: number;
}): boolean {
	const info = getDb()
		.prepare(
			`INSERT OR IGNORE INTO daily_checkins (target_id, date, minutes_used, respected_no_before, coins_awarded)
       VALUES (?, ?, ?, ?, ?)`
		)
		.run(
			input.targetId,
			input.date,
			input.minutesUsed ?? null,
			input.respectNoUseBefore != null ? (input.respectNoUseBefore ? 1 : 0) : null,
			input.coinsAwarded
		);
	return info.changes === 1;
}
export function getCheckinForDate(targetId: number, date: string): DailyCheckin | null {
	return (
		(getDb()
			.prepare('SELECT * FROM daily_checkins WHERE target_id = ? AND date = ?')
			.get(targetId, date) as DailyCheckin) ?? null
	);
}
export function getTodayCheckins(date: string): Record<number, DailyCheckin> {
	const rows = getDb()
		.prepare('SELECT * FROM daily_checkins WHERE date = ?')
		.all(date) as DailyCheckin[];
	const result: Record<number, DailyCheckin> = {};
	for (const r of rows) result[r.target_id] = r;
	return result;
}

// =========================================================================
//  Trigger journal
// =========================================================================
export function addTriggerEntry(input: NewTriggerEntry): TriggerEntry {
	const info = getDb()
		.prepare(
			`INSERT INTO trigger_journal (target_id, date, trigger, craving, note, gave_in)
       VALUES (@target_id, @date, @trigger, @craving, @note, @gave_in)`
		)
		.run({
			target_id: input.target_id ?? null,
			date: localDateTime(),
			trigger: input.trigger ?? null,
			craving: input.craving ?? null,
			note: input.note ?? null,
			gave_in: input.gave_in ? 1 : 0
		});
	return getDb()
		.prepare('SELECT * FROM trigger_journal WHERE id = ?')
		.get(Number(info.lastInsertRowid)) as TriggerEntry;
}
export function listTriggerEntries(opts?: { targetId?: number; limit?: number }): TriggerEntry[] {
	const limit = opts?.limit ?? 200;
	return opts?.targetId !== undefined
		? (getDb()
				.prepare('SELECT * FROM trigger_journal WHERE target_id = ? ORDER BY date DESC LIMIT ?')
				.all(opts.targetId, limit) as TriggerEntry[])
		: (getDb()
				.prepare('SELECT * FROM trigger_journal ORDER BY date DESC LIMIT ?')
				.all(limit) as TriggerEntry[]);
}
export function deleteTriggerEntry(id: number): void {
	getDb().prepare('DELETE FROM trigger_journal WHERE id = ?').run(id);
}

// =========================================================================
//  Push subscriptions
// =========================================================================
export function savePushSubscription(sub: WebPushKeys, userAgent?: string): PushSubscriptionRow {
	const db = getDb();
	db.prepare(
		`INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, last_seen)
     VALUES (@endpoint, @p256dh, @auth, @ua, datetime('now'))
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, last_seen = datetime('now')`
	).run({
		endpoint: sub.endpoint,
		p256dh: sub.keys.p256dh,
		auth: sub.keys.auth,
		ua: userAgent ?? null
	});
	return db
		.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?')
		.get(sub.endpoint) as PushSubscriptionRow;
}
export function listPushSubscriptions(): PushSubscriptionRow[] {
	return getDb().prepare('SELECT * FROM push_subscriptions').all() as PushSubscriptionRow[];
}
export function deletePushSubscription(endpoint: string): void {
	getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}
export function touchPushSubscription(endpoint: string): void {
	getDb()
		.prepare(`UPDATE push_subscriptions SET last_seen = datetime('now') WHERE endpoint = ?`)
		.run(endpoint);
}
