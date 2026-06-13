// src/lib/config/shop.ts
//
// Économie de pièces (centralisée ici) + catalogue de la boutique.
// Les articles cosmétiques et "vraies récompenses" sont étoffés à l'étape 6.

export const COIN_ECONOMY = {
	PER_HABIT: 5, // pièces par habitude "build" validée
	PER_CLEAN_DAY: 6, // pièces par journée "clean" (habitude "break")
	LEVEL_UP_BASE: 10, // pièces de base à la montée de niveau
	LEVEL_UP_PER_LEVEL: 2, // + par niveau atteint
	PRESTIGE_BONUS: 500 // bonus de pièces au prestige
} as const;

/** Pièces gagnées en atteignant `level` (récompense qui grossit avec le niveau). */
export function coinsForLevelUp(level: number): number {
	return COIN_ECONOMY.LEVEL_UP_BASE + COIN_ECONOMY.LEVEL_UP_PER_LEVEL * level;
}
