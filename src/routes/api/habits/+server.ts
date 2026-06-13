import type { RequestHandler } from './$types';
import { listHabits, createHabit } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import { validateNewHabit } from '$lib/server/schemas';

export const GET: RequestHandler = ({ url }) => {
	const archived = url.searchParams.get('archived') === '1';
	return ok({ habits: listHabits({ archived }) });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const v = validateNewHabit(body);
	if (!v.ok) return fail('VALIDATION', v.message, 400);
	return ok({ habit: createHabit(v.value) }, 201);
};
