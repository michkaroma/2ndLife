// src/lib/types.ts — shared domain types.
// Row types mirror SQLite columns 1:1 (numbers for 0/1 booleans);
// view-models are the shapes the UI consumes.

// ---------- enums / unions ----------
export type HabitType = 'build' | 'break';
export type HabitStatus = 'done' | 'skipped' | 'relapsed';
export type QuestScope = 'daily' | 'weekly';
export type RewardKind = 'cosmetic' | 'real';
export type LevelEventType = 'level_up' | 'prestige';
export type Difficulty = 1 | 2 | 3;
export type AddictionKind = 'tabac' | 'alcool' | 'sucre' | 'ecrans' | 'autre';

export type QuestKind =
	| 'generic'
	| 'build'
	| 'clean'
	| 'journaling'
	| 'variety'
	| 'streak'
	| 'sos';

// ---------- raw DB rows ----------
export interface UserStateRow {
	id: 1;
	total_xp: number;
	coins: number;
	prestige: number;
	freezes: number;
	last_active: string | null;
	last_freeze_grant: string | null;
	equipped_cosmetic_id: number | null;
	created_at: string;
}
export interface Habit {
	id: number;
	name: string;
	type: HabitType;
	category: string | null;
	difficulty: Difficulty;
	icon: string | null;
	archived: number;
	sort_order: number;
	created_at: string;
}
export interface HabitLog {
	id: number;
	habit_id: number;
	date: string;
	status: HabitStatus;
	note: string | null;
	xp_awarded: number;
	coins_awarded: number;
	logged_at: string;
}
export interface Quest {
	id: number;
	scope: QuestScope;
	kind: QuestKind;
	key: string;
	description: string;
	target: number;
	progress: number;
	reward_xp: number;
	reward_coins: number;
	period: string;
	completed: number;
	completed_at: string | null;
}
export interface Achievement {
	key: string;
	name: string;
	description: string | null;
	icon: string | null;
	reward_coins: number;
	unlocked_at: string | null;
}
export interface Reward {
	id: number;
	name: string;
	cost: number;
	kind: RewardKind;
	icon: string | null;
	description: string | null;
	min_level: number;
	repeatable: number;
	claimed_at: string | null;
}
export interface AddictionTarget {
	id: number;
	name: string;
	clean_since: string | null;
	money_per_day: number;
	best_streak_days: number;
	target_streak_days: number;
	kind: AddictionKind | null;
	icon: string | null;
	archived: number;
	defeated_at: string | null;
	created_at: string;
}
export interface TriggerEntry {
	id: number;
	target_id: number | null;
	date: string;
	trigger: string | null;
	craving: number | null;
	note: string | null;
	gave_in: number;
}
export interface PushSubscriptionRow {
	id: number;
	endpoint: string;
	p256dh: string;
	auth: string;
	user_agent: string | null;
	created_at: string;
	last_seen: string | null;
}
export interface OwnedCosmetic {
	id: number;
	reward_id: number;
	acquired_at: string;
}
export interface LevelEvent {
	id: number;
	type: LevelEventType;
	from_level: number | null;
	to_level: number | null;
	prestige: number;
	created_at: string;
	seen: number;
}

// ---------- input DTOs ----------
export interface NewHabit {
	name: string;
	type: HabitType;
	category?: string | null;
	difficulty?: Difficulty;
	icon?: string | null;
}
export type HabitPatch = Partial<NewHabit> & { sort_order?: number; archived?: boolean };
export interface NewReward {
	name: string;
	cost: number;
	kind: RewardKind;
	icon?: string | null;
	description?: string | null;
	min_level?: number;
	repeatable?: boolean;
}
export interface NewAddictionTarget {
	name: string;
	clean_since?: string | null;
	money_per_day?: number;
	target_streak_days?: number;
	kind?: AddictionKind;
	icon?: string | null;
}
export interface NewTriggerEntry {
	target_id: number | null;
	trigger?: string | null;
	craving?: number | null;
	note?: string | null;
	gave_in?: boolean;
}
export interface WebPushKeys {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

// ---------- computed view-models ----------
export interface LevelInfo {
	level: number;
	intoLevel: number;
	needed: number;
	totalXp: number;
	progressPct: number;
	prestige: number;
	canPrestige: boolean;
}
export interface StreakInfo {
	current: number;
	best: number;
}
export interface HabitWithStatus {
	habit: Habit;
	todayStatus: HabitStatus | null;
	streak: number;
	bestStreak: number;
}
export interface CleanStreakInfo {
	currentDays: number;
	bestDays: number;
	moneySaved: number;
}
export interface HealthMilestone {
	afterLabel: string;
	afterSeconds: number;
	title: string;
	message: string;
	reached?: boolean;
}
export interface QuestView extends Quest {
	progressPct: number;
}

export interface ProgressDelta {
	xpGained: number;
	coinsGained: number;
	totalXp: number;
	coins: number;
	freezes: number;
	leveledUp: boolean;
	newLevel: number | null;
	level: LevelInfo;
	streakDays: number;
	unlockedAchievements: Achievement[];
	completedQuests: Quest[];
}
export interface LogResult {
	log: HabitLog;
	delta: ProgressDelta;
	levelBefore: number;
	levelAfter: number;
}

export interface TodayView {
	date: string;
	habits: { habit: Habit; log: HabitLog | null; streak: number }[];
	globalStreak: number;
}
export interface SyncStateResponse {
	userState: UserStateRow;
	level: LevelInfo;
	today: TodayView;
	quests: Quest[];
}

// ---------- feedback / UI ----------
export interface ToastItem {
	id: string;
	message: string;
	tone?: 'info' | 'success' | 'warn' | 'danger' | 'flame' | 'gold';
	icon?: string;
	action?: { label: string; run: () => void };
	duration?: number;
}
export interface ApiError {
	error: { code: string; message: string };
}
