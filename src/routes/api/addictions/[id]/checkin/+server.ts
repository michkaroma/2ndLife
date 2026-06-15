import type { RequestHandler } from './$types';
import { getAddictionTarget, insertCheckin, addCoins, localDate } from '$lib/server/db';
import { ok, fail } from '$lib/server/respond';
import { COIN_ECONOMY } from '$lib/config/shop';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	const boss = getAddictionTarget(id);
	if (!boss) return fail('NOT_FOUND', 'Boss introuvable.', 404);

	// Seuls les boss avec règle limit ou no_use_before ont un check-in
	const hasLimit = boss.mode === 'limit' && boss.daily_limit_minutes != null;
	const hasNoBefore = boss.no_use_before != null;
	if (!hasLimit && !hasNoBefore) {
		return fail('NO_CHECKIN', "Ce boss n'a pas de règle journalière à valider.", 400);
	}

	const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const minutesUsed = typeof b.minutesUsed === 'number' ? Math.max(0, b.minutesUsed) : null;
	const respectNoUseBefore = typeof b.respectNoUseBefore === 'boolean' ? b.respectNoUseBefore : null;

	// Évaluer la journée
	let daySuccess = true;
	if (hasLimit && minutesUsed !== null) {
		daySuccess = minutesUsed <= (boss.daily_limit_minutes as number);
	}
	if (hasNoBefore && respectNoUseBefore !== null) {
		daySuccess = daySuccess && respectNoUseBefore === true;
	}
	// Si les données ne permettent pas d'évaluer → succès par défaut (confiance)
	if (hasLimit && minutesUsed === null) daySuccess = false;
	if (hasNoBefore && respectNoUseBefore === null) daySuccess = false;

	if (!daySuccess) {
		return ok({ success: false, coinsAwarded: 0 });
	}

	// Journée réussie : enregistre + récompense
	const today = localDate();
	const coinsAwarded = COIN_ECONOMY.PER_CLEAN_DAY;
	const inserted = insertCheckin({
		targetId: id,
		date: today,
		minutesUsed: minutesUsed ?? null,
		respectNoUseBefore: respectNoUseBefore,
		coinsAwarded
	});

	// INSERT OR IGNORE → si déjà checké aujourd'hui, coins non redonné
	if (inserted) {
		addCoins(coinsAwarded);
	}

	return ok({ success: true, coinsAwarded: inserted ? coinsAwarded : 0 });
};
