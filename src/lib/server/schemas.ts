// src/lib/server/schemas.ts — validateurs manuels (sans dépendance Zod).
// Renvoient { ok:true, value } ou { ok:false, message } (message FR).
import type {
	NewHabit,
	HabitPatch,
	HabitType,
	HabitFrequency,
	Difficulty,
	NewOneTimeTask,
	OneTimeTaskPatch
} from '../types';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const TYPES: HabitType[] = ['build', 'break'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | null {
	return typeof v === 'string' ? v.trim() : null;
}
function diff(v: unknown): Difficulty | null {
	const n = Number(v);
	return n === 1 || n === 2 || n === 3 ? (n as Difficulty) : null;
}
function freq(v: unknown): HabitFrequency | null {
	return v === 'daily' || v === 'weekly' ? v : null;
}
/** Quota hebdo : entier 1..7 (UNIQUE(habit_id,date) plafonne à 1 check-in/jour). */
function quota(v: unknown): number | null {
	const n = Number(v);
	if (!Number.isFinite(n)) return null;
	const i = Math.floor(n);
	return i >= 1 && i <= 7 ? i : null;
}

export function validateNewHabit(body: unknown): Result<NewHabit> {
	const b = (body ?? {}) as Record<string, unknown>;
	const name = str(b.name);
	if (!name || name.length < 1 || name.length > 60)
		return { ok: false, message: 'Le nom est obligatoire (1 à 60 caractères).' };
	if (typeof b.type !== 'string' || !TYPES.includes(b.type as HabitType))
		return { ok: false, message: 'Le type doit être « build » ou « break ».' };
	const difficulty = b.difficulty === undefined ? 1 : diff(b.difficulty);
	if (difficulty === null) return { ok: false, message: 'La difficulté doit être entre 1 et 3.' };
	const category = str(b.category);
	const icon = str(b.icon);
	if (category && category.length > 40)
		return { ok: false, message: 'La catégorie est trop longue (max 40 caractères).' };

	let frequency_type: HabitFrequency = 'daily';
	if (b.frequency_type !== undefined) {
		const f = freq(b.frequency_type);
		if (!f) return { ok: false, message: 'La fréquence doit être « daily » ou « weekly ».' };
		frequency_type = f;
	}
	let weekly_quota = 1;
	if (frequency_type === 'weekly') {
		const q = b.weekly_quota === undefined ? 2 : quota(b.weekly_quota);
		if (q === null)
			return { ok: false, message: 'Le quota hebdomadaire doit être un entier entre 1 et 7.' };
		weekly_quota = q;
	}

	return {
		ok: true,
		value: {
			name,
			type: b.type as HabitType,
			difficulty,
			category: category || null,
			icon: icon || null,
			frequency_type,
			weekly_quota
		}
	};
}

export function validateHabitPatch(body: unknown): Result<HabitPatch> {
	const b = (body ?? {}) as Record<string, unknown>;
	const patch: HabitPatch = {};
	if (b.name !== undefined) {
		const name = str(b.name);
		if (!name || name.length > 60) return { ok: false, message: 'Nom invalide (1 à 60 caractères).' };
		patch.name = name;
	}
	if (b.type !== undefined) {
		if (!TYPES.includes(b.type as HabitType))
			return { ok: false, message: 'Type invalide.' };
		patch.type = b.type as HabitType;
	}
	if (b.difficulty !== undefined) {
		const d = diff(b.difficulty);
		if (d === null) return { ok: false, message: 'La difficulté doit être entre 1 et 3.' };
		patch.difficulty = d;
	}
	if (b.category !== undefined) patch.category = str(b.category) || null;
	if (b.icon !== undefined) patch.icon = str(b.icon) || null;
	if (b.frequency_type !== undefined) {
		const f = freq(b.frequency_type);
		if (!f) return { ok: false, message: 'Fréquence invalide.' };
		patch.frequency_type = f;
	}
	if (b.weekly_quota !== undefined) {
		const q = quota(b.weekly_quota);
		if (q === null)
			return { ok: false, message: 'Le quota hebdomadaire doit être un entier entre 1 et 7.' };
		patch.weekly_quota = q;
	}
	if (b.archived !== undefined) patch.archived = Boolean(b.archived);
	if (b.sort_order !== undefined && typeof b.sort_order === 'number') patch.sort_order = b.sort_order;
	return { ok: true, value: patch };
}

// ---------- tâches ponctuelles (Feature 1) ----------
export function validateNewOneTimeTask(body: unknown): Result<NewOneTimeTask> {
	const b = (body ?? {}) as Record<string, unknown>;
	const title = str(b.title);
	if (!title || title.length > 80)
		return { ok: false, message: 'Le titre est obligatoire (1 à 80 caractères).' };
	const note = str(b.note);
	if (note && note.length > 280)
		return { ok: false, message: 'La note est trop longue (max 280 caractères).' };
	let due_date: string | null = null;
	if (b.due_date !== undefined && b.due_date !== null && b.due_date !== '') {
		const d = str(b.due_date);
		if (!d || !DATE_RE.test(d))
			return { ok: false, message: 'La date cible doit être au format AAAA-MM-JJ.' };
		due_date = d;
	}
	const difficulty = b.difficulty === undefined ? 1 : diff(b.difficulty);
	if (difficulty === null) return { ok: false, message: 'La difficulté doit être entre 1 et 3.' };
	return { ok: true, value: { title, note: note || null, due_date, difficulty } };
}

export function validateOneTimeTaskPatch(body: unknown): Result<OneTimeTaskPatch> {
	const b = (body ?? {}) as Record<string, unknown>;
	const patch: OneTimeTaskPatch = {};
	if (b.title !== undefined) {
		const t = str(b.title);
		if (!t || t.length > 80) return { ok: false, message: 'Titre invalide (1 à 80 caractères).' };
		patch.title = t;
	}
	if (b.note !== undefined) {
		const n = str(b.note);
		if (n && n.length > 280)
			return { ok: false, message: 'La note est trop longue (max 280 caractères).' };
		patch.note = n || null;
	}
	if (b.due_date !== undefined) {
		if (b.due_date === null || b.due_date === '') patch.due_date = null;
		else {
			const d = str(b.due_date);
			if (!d || !DATE_RE.test(d))
				return { ok: false, message: 'La date cible doit être au format AAAA-MM-JJ.' };
			patch.due_date = d;
		}
	}
	if (b.difficulty !== undefined) {
		const d = diff(b.difficulty);
		if (d === null) return { ok: false, message: 'La difficulté doit être entre 1 et 3.' };
		patch.difficulty = d;
	}
	return { ok: true, value: patch };
}
