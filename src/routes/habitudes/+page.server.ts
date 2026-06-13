import type { PageServerLoad } from './$types';
import { listHabits } from '$lib/server/db';

export const load: PageServerLoad = () => {
	return {
		active: listHabits(),
		archived: listHabits({ archived: true })
	};
};
