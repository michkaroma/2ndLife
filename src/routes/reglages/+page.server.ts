import type { PageServerLoad } from './$types';
import { listAchievements, getSetting } from '$lib/server/db';

export const load: PageServerLoad = () => {
	return { achievements: listAchievements(), timezone: getSetting<string>('timezone') };
};
