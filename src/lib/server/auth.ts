// src/lib/server/auth.ts
// Mono-utilisateur : un seul APP_PASSWORD. Session = cookie signé HMAC,
// auto-validant et auto-expirant (pas de table de session, pas de lib JWT).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'hq_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 jours

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE;

/** Clé HMAC : SESSION_SECRET si défini, sinon dérivée de APP_PASSWORD
 *  (changer le mot de passe invalide alors toutes les sessions). */
function secret(): string {
	const explicit = env.SESSION_SECRET;
	if (explicit && explicit.length >= 8) return explicit;
	return (env.APP_PASSWORD ?? 'habitquest') + '::hq-session-v1';
}

/** token = base64url(issuedAt) . base64url(hmac) */
export function signSession(now: number): string {
	const p = Buffer.from(String(now)).toString('base64url');
	const sig = createHmac('sha256', secret()).update(p).digest('base64url');
	return `${p}.${sig}`;
}

export function verifySession(token: string | undefined, now: number): boolean {
	if (!token) return false;
	const [p, sig] = token.split('.');
	if (!p || !sig) return false;
	const expected = createHmac('sha256', secret()).update(p).digest('base64url');
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
	const issuedAt = Number(Buffer.from(p, 'base64url').toString('utf8'));
	if (!Number.isFinite(issuedAt)) return false;
	if (now - issuedAt > MAX_AGE * 1000) return false;
	return true;
}

/** Comparaison à temps constant du mot de passe. */
export function passwordMatches(input: string): boolean {
	const expected = env.APP_PASSWORD ?? '';
	const a = Buffer.from(input);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
