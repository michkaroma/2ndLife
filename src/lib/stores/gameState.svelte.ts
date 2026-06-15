// src/lib/stores/gameState.svelte.ts
// État de jeu partagé (runes au niveau module = singleton réactif). Tient
// l'état utilisateur + niveau dérivé + quêtes + statut des habitudes du jour.
// Mis à jour optimistiquement à la validation, puis réconcilié avec le serveur.
import { levelFromXp, PROGRESSION } from '$lib/config/progression';
import type {
	UserStateRow,
	LevelInfo,
	ProgressDelta,
	Quest,
	HabitStatus,
	SyncStateResponse,
	Habit
} from '$lib/types';

interface TodayHabit {
	habitId: number;
	streak: number;
	logStatus: HabitStatus | null;
}
interface Shape {
	user: UserStateRow;
	quests: Quest[];
	today: Record<number, TodayHabit>;
	globalStreak: number;
}

const EMPTY_USER: UserStateRow = {
	id: 1,
	total_xp: 0,
	coins: 0,
	prestige: 0,
	freezes: 0,
	last_active: null,
	last_freeze_grant: null,
	equipped_theme_id: null,
	equipped_skin_id: null,
	equipped_accessory_id: null,
	equipped_frame_id: null,
	created_at: ''
};

const gs = $state<Shape>({ user: EMPTY_USER, quests: [], today: {}, globalStreak: 0 });

function computeLevel(user: UserStateRow): LevelInfo {
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

const level = $derived.by(() => computeLevel(gs.user));

export const gameState = {
	get user() {
		return gs.user;
	},
	get quests() {
		return gs.quests;
	},
	get today() {
		return gs.today;
	},
	get globalStreak() {
		return gs.globalStreak;
	},
	get level(): LevelInfo {
		return level;
	},
	get xpPercent(): number {
		return level.progressPct;
	},

	/** Hydrate depuis le load() SSR ou GET /api/sync/state. */
	hydrate(payload: SyncStateResponse) {
		gs.user = payload.userState;
		gs.quests = payload.quests;
		gs.globalStreak = payload.today.globalStreak;
		gs.today = Object.fromEntries(
			payload.today.habits.map((h) => [
				h.habit.id,
				{ habitId: h.habit.id, streak: h.streak, logStatus: h.log?.status ?? null }
			])
		);
	},

	/** OPTIMISTE : appelé dès le tap, avant la réponse réseau. */
	optimisticLog(habit: Pick<Habit, 'id' | 'difficulty' | 'type'>) {
		const cur = gs.today[habit.id];
		if (cur && cur.logStatus === 'done') return;
		const guessStreak = (cur?.streak ?? 0) + 1;
		const base =
			(habit.type === 'break' ? PROGRESSION.XP_BREAK_HABIT_DAY : PROGRESSION.XP_PER_HABIT) *
			habit.difficulty;
		const bonus = Math.min(
			guessStreak * PROGRESSION.STREAK_BONUS_PER_DAY,
			PROGRESSION.STREAK_BONUS_CAP
		);
		const xp = Math.round(base * (1 + bonus));
		gs.user = { ...gs.user, total_xp: gs.user.total_xp + xp };
		gs.today = { ...gs.today, [habit.id]: { habitId: habit.id, streak: guessStreak, logStatus: 'done' } };
	},

	/** RÉCONCILIE : remplace l'optimisme par le delta autoritaire du serveur. */
	reconcile(delta: ProgressDelta, habitId?: number, status: HabitStatus = 'done') {
		gs.user = {
			...gs.user,
			total_xp: delta.totalXp,
			coins: delta.coins,
			freezes: delta.freezes,
			prestige: delta.level.prestige
		};
		if (habitId != null) {
			gs.today = {
				...gs.today,
				[habitId]: { habitId, streak: delta.streakDays, logStatus: status }
			};
		}
		if (delta.completedQuests.length) {
			const byId = new Map(delta.completedQuests.map((q) => [q.id, q]));
			gs.quests = gs.quests.map((q) => byId.get(q.id) ?? q);
		}
	},

	setQuests(quests: Quest[]) {
		gs.quests = quests;
	},

	/** ANNULE l'optimisme si l'appel échoue (et n'a pas été mis en file). */
	rollbackLog(habitId: number, prev: TodayHabit | undefined, prevXp: number) {
		gs.user = { ...gs.user, total_xp: prevXp };
		if (prev) gs.today = { ...gs.today, [habitId]: prev };
		else {
			const next = { ...gs.today };
			delete next[habitId];
			gs.today = next;
		}
	}
};
