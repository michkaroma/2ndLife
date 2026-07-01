// src/hooks.server.ts — garde d'accès (cookie session), init base + planificateur de rappels.
import type { Handle, ServerInit } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import cron from 'node-cron';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';
import { initDb, getTimezone } from '$lib/server/db';
import { seedAchievementsCatalog } from '$lib/server/achievements';
import { seedShop } from '$lib/server/shop';
import { env } from '$lib/server/env';
import { sendToAll } from '$lib/server/push';
import { buildDailyReminder } from '$lib/server/reminder';

const PUBLIC_EXACT = new Set<string>([
	'/login',
	'/manifest.webmanifest',
	'/service-worker.js',
	'/favicon.png',
	'/robots.txt'
]);
const PUBLIC_PREFIX = ['/api/auth', '/api/cron', '/_app/', '/icons/', '/workbox-'];

function isPublic(pathname: string): boolean {
	return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

let started = false;
export const init: ServerInit = async () => {
	initDb();
	seedAchievementsCatalog();
	seedShop();
	if (started || env.DISABLE_CRON) return;
	started = true;
	const [h, m] = env.PUSH_TIME.split(':');
	if (cron.validate(`${Number(m)} ${Number(h)} * * *`)) {
		cron.schedule(
			`${Number(m)} ${Number(h)} * * *`,
			async () => {
				await sendToAll(buildDailyReminder());
			},
			{ timezone: getTimezone() }
		);
		// TODO(prompt-2): reprogrammer le cron à chaud quand le fuseau change
		console.log(`[cron] Rappel quotidien programmé à ${env.PUSH_TIME} (${getTimezone()})`);
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const authed = verifySession(event.cookies.get(SESSION_COOKIE), Date.now());
	event.locals.authed = authed;

	if (!authed && !isPublic(pathname)) {
		if (pathname.startsWith('/api/')) throw error(401, 'Non authentifié');
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(pathname + event.url.search)}`);
	}

	return resolve(event);
};
