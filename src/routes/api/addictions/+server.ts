import type { RequestHandler } from './$types';
import { listAddictionTargets, createAddictionTarget, localDate, getTodayCheckins } from '$lib/server/db';
import { computeBossState } from '$lib/server/boss';
import { BOSS } from '$lib/config/boss';
import { ok, fail } from '$lib/server/respond';
import type { AddictionKind, NewAddictionTarget, BossMode } from '$lib/types';

const BEHAVIORAL_KINDS = new Set(['reseaux', 'jeux', 'ecrans'] as const);
const ALL_KINDS: AddictionKind[] = ['tabac', 'alcool', 'sucre', 'ecrans', 'reseaux', 'jeux', 'autre'];

export const GET: RequestHandler = () => {
	const today = localDate();
	const targets = listAddictionTargets();
	const checkins = getTodayCheckins(today);
	return ok({ bosses: targets.map((t) => computeBossState(t, today, checkins[t.id] ?? null)) });
};

export const POST: RequestHandler = async ({ request }) => {
	const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const name = typeof b.name === 'string' ? b.name.trim() : '';
	if (!name || name.length > 60) return fail('VALIDATION', 'Donne un nom à ton boss.', 400);

	const kind = ALL_KINDS.includes(b.kind as AddictionKind) ? (b.kind as AddictionKind) : 'reseaux';
	const behavioral = BEHAVIORAL_KINDS.has(kind as 'reseaux' | 'jeux' | 'ecrans');

	const target = Number(b.target_streak_days);
	const targetDays = Number.isFinite(target)
		? Math.max(BOSS.MIN_TARGET, Math.min(BOSS.MAX_TARGET, Math.floor(target)))
		: BOSS.DEFAULT_TARGET;

	const mode: BossMode = b.mode === 'limit' ? 'limit' : 'abstinence';
	const daily_limit_minutes = mode === 'limit' && Number.isFinite(Number(b.daily_limit_minutes))
		? Math.max(1, Math.floor(Number(b.daily_limit_minutes)))
		: null;
	const no_use_before = typeof b.no_use_before === 'string' && /^\d{2}:\d{2}$/.test(b.no_use_before)
		? b.no_use_before
		: null;
	const baseline = Number.isFinite(Number(b.baseline_minutes_per_day))
		? Math.max(0, Math.floor(Number(b.baseline_minutes_per_day)))
		: 0;
	const money = Number(b.money_per_day);

	const input: NewAddictionTarget = {
		name,
		kind,
		clean_since: typeof b.clean_since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.clean_since) ? b.clean_since : null,
		target_streak_days: targetDays,
		icon: typeof b.icon === 'string' && b.icon ? b.icon : null,
		mode,
		daily_limit_minutes,
		no_use_before,
		baseline_minutes_per_day: baseline,
		track_time: behavioral || Boolean(b.track_time),
		track_money: !behavioral || Boolean(b.track_money),
		money_per_day: Number.isFinite(money) && money >= 0 ? money : 0
	};
	const created = createAddictionTarget(input);
	const today = localDate();
	return ok({ target: created, boss: computeBossState(created, today, null) }, 201);
};
