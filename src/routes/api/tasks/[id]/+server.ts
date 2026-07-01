import type { RequestHandler } from './$types';
import { getOneTimeTask, updateOneTimeTask, deleteOneTimeTask } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import { validateOneTimeTaskPatch } from '$lib/server/schemas';

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!getOneTimeTask(id)) return fail('NOT_FOUND', 'Tâche introuvable.', 404);
	const body = await request.json().catch(() => ({}));
	const v = validateOneTimeTaskPatch(body);
	if (!v.ok) return fail('VALIDATION', v.message, 400);
	return ok({ task: updateOneTimeTask(id, v.value) });
};

export const DELETE: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	if (!getOneTimeTask(id)) return fail('NOT_FOUND', 'Tâche introuvable.', 404);
	deleteOneTimeTask(id);
	return ok({ ok: true });
};
