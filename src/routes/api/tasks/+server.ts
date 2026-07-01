import type { RequestHandler } from './$types';
import { listOneTimeTasks, createOneTimeTask } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import { validateNewOneTimeTask } from '$lib/server/schemas';

export const GET: RequestHandler = () => {
	return ok({
		active: listOneTimeTasks({ status: 'todo' }),
		done: listOneTimeTasks({ status: 'done' })
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const v = validateNewOneTimeTask(body);
	if (!v.ok) return fail('VALIDATION', v.message, 400);
	return ok({ task: createOneTimeTask(v.value) }, 201);
};
