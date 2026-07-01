import type { RequestHandler } from './$types';
import { reopenOneTimeTask } from '$lib/server/progression';
import { ok, fail } from '$lib/server/respond';

export const POST: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const r = reopenOneTimeTask(id);
	if (!r) return fail('NOT_FOUND', 'Tâche introuvable.', 404);
	return ok({ task: r.task, delta: r.delta });
};
