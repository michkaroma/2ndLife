// src/lib/client/api.ts — wrapper fetch (gère le 401).
// L'enfilement hors-ligne (outbox) est ajouté à l'étape 8.
import { goto } from '$app/navigation';
import { enqueueLog } from './outbox';
import { sync } from '$lib/stores/sync.svelte';
import type { ProgressDelta, HabitLog, HabitStatus, Quest, OneTimeTask } from '$lib/types';

export class ApiFailure extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

async function parseError(res: Response): Promise<ApiFailure> {
	const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
	return new ApiFailure(data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Une erreur est survenue.');
}

/** Appel JSON générique authentifié. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (res.status === 401) {
		await goto('/login');
		throw new ApiFailure('UNAUTH', 'Session expirée.');
	}
	if (!res.ok) throw await parseError(res);
	return (await res.json()) as T;
}

export interface LogResponse {
	delta: ProgressDelta;
	log: HabitLog;
	quests?: Quest[];
	clientId: string | null;
}

export type LogOutcome = LogResponse | { queued: true };

/** Valide une habitude. Hors-ligne ou en cas d'échec réseau → mise en file (outbox),
 *  jamais perdue. Lève uniquement si la session a expiré (redirection /login). */
export async function postLog(
	habitId: number,
	body: { date: string; status?: HabitStatus; note?: string | null }
): Promise<LogOutcome> {
	const enqueue = async (): Promise<{ queued: true }> => {
		const stored = await enqueueLog({ habitId, date: body.date, status: body.status, note: body.note });
		if (!stored) throw new ApiFailure('OFFLINE_UNAVAILABLE', 'Stockage hors-ligne indisponible.');
		sync.markPending();
		return { queued: true };
	};

	if (typeof navigator !== 'undefined' && !navigator.onLine) return enqueue();
	try {
		return await apiFetch<LogResponse>(`/api/habits/${habitId}/log`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	} catch (e) {
		if (e instanceof ApiFailure && e.code === 'UNAUTH') throw e;
		return enqueue();
	}
}

export async function deleteLog(
	habitId: number,
	date: string
): Promise<{ delta: ProgressDelta; quests?: Quest[] }> {
	return apiFetch(`/api/habits/${habitId}/log`, { method: 'DELETE', body: JSON.stringify({ date }) });
}

export async function claimQuest(
	id: number
): Promise<{ delta: ProgressDelta; quest: Quest; quests: Quest[] }> {
	return apiFetch(`/api/quests/${id}/claim`, { method: 'POST' });
}

// ---- Tâches ponctuelles (Feature 1) ----
export async function completeTask(
	id: number
): Promise<{ task: OneTimeTask; delta: ProgressDelta }> {
	return apiFetch(`/api/tasks/${id}/complete`, { method: 'POST' });
}
export async function reopenTask(
	id: number
): Promise<{ task: OneTimeTask; delta: ProgressDelta }> {
	return apiFetch(`/api/tasks/${id}/reopen`, { method: 'POST' });
}
