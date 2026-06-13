// src/lib/config/progression.ts
//
// ⭐ TOUS les réglages d'équilibrage de la COURBE vivent ici.
// (L'économie de pièces vit dans `shop.ts` → COIN_ECONOMY ; le contenu
//  — succès, quêtes, avatar, boss — dans les autres fichiers `config/*`.)

export const PROGRESSION = {
	// --- Courbe de niveaux ---
	// XP nécessaire pour passer du niveau L au niveau L+1.
	BASE_XP: 100,
	EXPONENT: 1.5, // 1.0 = linéaire | 1.5 = doux (recommandé) | 2.0 = raide

	// --- XP gagné ---
	XP_PER_HABIT: 25, // habitude "à construire" validée (× difficulté)
	XP_BREAK_HABIT_DAY: 30, // journée "clean" sur une addiction (× difficulté)

	// --- Bonus de série ---
	STREAK_BONUS_PER_DAY: 0.02, // +2 % d'XP par jour consécutif
	STREAK_BONUS_CAP: 0.5, // plafonné à +50 %

	// --- Filet de sécurité (anti-spirale de honte) ---
	FREEZES_PER_WEEK: 1, // "gels" de série offerts chaque semaine
	FREEZES_MAX: 3, // stock maximum de gels

	// --- Prestige (anti-stagnation en fin de partie) ---
	PRESTIGE_LEVEL: 50, // niveau à partir duquel le prestige est possible

	// --- Tolérance de validation hors-ligne (jours en arrière) ---
	MAX_BACKFILL_DAYS: 2
} as const;

/** XP requis pour passer du niveau `level` au niveau suivant. */
export function xpToNextLevel(level: number): number {
	return Math.floor(PROGRESSION.BASE_XP * Math.pow(level, PROGRESSION.EXPONENT));
}

/** XP cumulé total nécessaire pour atteindre un niveau donné (niveau 1 = 0). */
export function totalXpForLevel(level: number): number {
	let total = 0;
	for (let l = 1; l < level; l++) total += xpToNextLevel(l);
	return total;
}

/** Déduit le niveau et la progression interne à partir de l'XP total. */
export function levelFromXp(totalXp: number): {
	level: number;
	intoLevel: number; // XP accumulé dans le niveau courant
	needed: number; // XP nécessaire pour finir le niveau courant
} {
	let level = 1;
	let remaining = totalXp;
	while (remaining >= xpToNextLevel(level)) {
		remaining -= xpToNextLevel(level);
		level++;
	}
	return { level, intoLevel: remaining, needed: xpToNextLevel(level) };
}

/** XP effectif d'une action, bonus de série inclus. */
export function xpWithStreak(base: number, streakDays: number): number {
	const bonus = Math.min(
		streakDays * PROGRESSION.STREAK_BONUS_PER_DAY,
		PROGRESSION.STREAK_BONUS_CAP
	);
	return Math.round(base * (1 + bonus));
}
