// src/lib/client/api.ts — wrapper fetch (gère le 401).
// L'enfilement hors-ligne (outbox) est ajouté à l'étape 8.
import { goto } from '$app/navigation';
import type { ProgressDelta, HabitLog, HabitStatus } from '$lib/types';

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
	clientId: string | null;
}

/** Valide une habitude (en ligne). Lève en cas d'échec → le client annule l'optimisme. */
export async function postLog(
	habitId: number,
	body: { date: string; status?: HabitStatus; note?: string | null; clientId?: string }
): Promise<LogResponse> {
	return apiFetch<LogResponse>(`/api/habits/${habitId}/log`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export async function deleteLog(habitId: number, date: string): Promise<{ delta: ProgressDelta }> {
	return apiFetch(`/api/habits/${habitId}/log`, { method: 'DELETE', body: JSON.stringify({ date }) });
}
