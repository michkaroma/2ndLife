import type { RequestHandler } from './$types';
import { getHabit, localDate, daysBetween } from '$lib/server/db';
import { logHabit, reverseHabitLog } from '$lib/server/progression';
import { PROGRESSION } from '$lib/config/progression';
import { ok, fail } from '$lib/server/respond';
import type { HabitStatus } from '$lib/types';

const STATUSES: HabitStatus[] = ['done', 'skipped', 'relapsed'];

/** Borne la date proposée : pas dans le futur, tolérance de quelques jours passés. */
function clampDate(input: unknown): string {
	const today = localDate();
	if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today;
	const diff = daysBetween(input, today); // today - input
	if (diff < 0) return today; // futur → aujourd'hui
	if (diff > PROGRESSION.MAX_BACKFILL_DAYS) return today; // trop ancien → aujourd'hui
	return input;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const habit = getHabit(id);
	if (!habit || habit.archived) return fail('NOT_FOUND', 'Habitude introuvable.', 404);

	const body = (await request.json().catch(() => ({}))) as {
		date?: string;
		status?: HabitStatus;
		note?: string | null;
		clientId?: string;
	};
	const date = clampDate(body.date);
	const status = STATUSES.includes(body.status as HabitStatus) ? (body.status as HabitStatus) : 'done';
	const note = typeof body.note === 'string' ? body.note : null;

	const { log, delta } = logHabit(id, date, status, note);
	return ok({ delta, log, clientId: body.clientId ?? null });
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!getHabit(id)) return fail('NOT_FOUND', 'Habitude introuvable.', 404);
	const body = (await request.json().catch(() => ({}))) as { date?: string };
	const date = clampDate(body.date);
	return ok({ delta: reverseHabitLog(id, date) });
};
