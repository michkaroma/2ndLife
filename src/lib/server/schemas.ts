// src/lib/server/schemas.ts — validateurs manuels (sans dépendance Zod).
// Renvoient { ok:true, value } ou { ok:false, message } (message FR).
import type { NewHabit, HabitPatch, HabitType, Difficulty } from '../types';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const TYPES: HabitType[] = ['build', 'break'];

function str(v: unknown): string | null {
	return typeof v === 'string' ? v.trim() : null;
}
function diff(v: unknown): Difficulty | null {
	const n = Number(v);
	return n === 1 || n === 2 || n === 3 ? (n as Difficulty) : null;
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
	return {
		ok: true,
		value: {
			name,
			type: b.type as HabitType,
			difficulty,
			category: category || null,
			icon: icon || null
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
	if (b.archived !== undefined) patch.archived = Boolean(b.archived);
	if (b.sort_order !== undefined && typeof b.sort_order === 'number') patch.sort_order = b.sort_order;
	return { ok: true, value: patch };
}
