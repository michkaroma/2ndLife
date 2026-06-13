// src/lib/config/shop.ts
// Économie de pièces (centralisée) + catalogue de la boutique.

export const COIN_ECONOMY = {
	PER_HABIT: 5, // pièces par habitude "build" validée
	PER_CLEAN_DAY: 6, // pièces par journée "clean" (habitude "break")
	LEVEL_UP_BASE: 10, // pièces de base à la montée de niveau
	LEVEL_UP_PER_LEVEL: 2, // + par niveau atteint
	PRESTIGE_BONUS: 500 // bonus de pièces au prestige
} as const;

/** Pièces gagnées en atteignant `level` (récompense qui grossit avec le niveau). */
export function coinsForLevelUp(level: number): number {
	return COIN_ECONOMY.LEVEL_UP_BASE + level * COIN_ECONOMY.LEVEL_UP_PER_LEVEL;
}

export type ShopCategory = 'avatar_skin' | 'accessory' | 'theme' | 'badge_frame';

/** Article cosmétique par défaut (→ table rewards, kind='cosmetic'). */
export interface CosmeticItem {
	key: string;
	name: string; // FR
	description: string; // FR
	category: ShopCategory;
	icon: string;
	cost: number;
	unlockLevel: number;
	assetId: string;
}

export const COSMETICS: readonly CosmeticItem[] = [
	// Thèmes
	{ key: 'theme_midnight', name: 'Thème Minuit', description: 'Un bleu nuit profond, sobre et reposant.', category: 'theme', icon: '🌌', cost: 80, unlockLevel: 0, assetId: 'theme:midnight' },
	{ key: 'theme_ember', name: 'Thème Braise', description: 'Des accents orange chaleureux.', category: 'theme', icon: '🔥', cost: 150, unlockLevel: 5, assetId: 'theme:ember' },
	{ key: 'theme_forest', name: 'Thème Forêt', description: 'Des verts apaisants pour rester ancré.', category: 'theme', icon: '🌿', cost: 150, unlockLevel: 8, assetId: 'theme:forest' },
	{ key: 'theme_aurora', name: 'Thème Aurore', description: 'Dégradé violet et turquoise, hypnotique.', category: 'theme', icon: '🌠', cost: 350, unlockLevel: 15, assetId: 'theme:aurora' },
	{ key: 'theme_gold', name: 'Thème Or royal', description: 'Réservé aux légendes : touches dorées.', category: 'theme', icon: '👑', cost: 600, unlockLevel: 25, assetId: 'theme:gold' },
	// Skins d'avatar
	{ key: 'skin_default_alt', name: 'Tenue alternative', description: 'Une variante de couleur pour ta créature.', category: 'avatar_skin', icon: '🎨', cost: 100, unlockLevel: 0, assetId: 'skin:alt' },
	{ key: 'skin_ninja', name: 'Tenue Ninja', description: 'Discret et déterminé.', category: 'avatar_skin', icon: '🥷', cost: 250, unlockLevel: 7, assetId: 'skin:ninja' },
	{ key: 'skin_explorer', name: 'Tenue Explorateur', description: 'Prêt pour l’aventure du quotidien.', category: 'avatar_skin', icon: '🧭', cost: 250, unlockLevel: 10, assetId: 'skin:explorer' },
	{ key: 'skin_mage', name: 'Tenue Mage', description: 'Maîtrise la magie des bonnes habitudes.', category: 'avatar_skin', icon: '🧙', cost: 400, unlockLevel: 18, assetId: 'skin:mage' },
	{ key: 'skin_celestial', name: 'Tenue Céleste', description: 'Une aura d’étoiles pour les héros accomplis.', category: 'avatar_skin', icon: '✨', cost: 700, unlockLevel: 30, assetId: 'skin:celestial' },
	// Accessoires
	{ key: 'acc_cap', name: 'Casquette', description: 'Un petit couvre-chef décontracté.', category: 'accessory', icon: '🧢', cost: 60, unlockLevel: 0, assetId: 'acc:cap' },
	{ key: 'acc_glasses', name: 'Lunettes', description: 'Pour voir l’avenir avec clarté.', category: 'accessory', icon: '👓', cost: 90, unlockLevel: 3, assetId: 'acc:glasses' },
	{ key: 'acc_crown', name: 'Couronne', description: 'Tu règnes sur tes habitudes.', category: 'accessory', icon: '👑', cost: 300, unlockLevel: 20, assetId: 'acc:crown' },
	{ key: 'acc_wings', name: 'Ailes', description: 'Prends ton envol vers de nouveaux sommets.', category: 'accessory', icon: '🪽', cost: 500, unlockLevel: 28, assetId: 'acc:wings' },
	{ key: 'acc_halo', name: 'Auréole', description: 'La marque des prestiges.', category: 'accessory', icon: '😇', cost: 450, unlockLevel: 35, assetId: 'acc:halo' },
	// Cadres de badge
	{ key: 'frame_bronze', name: 'Cadre Bronze', description: 'Encadre ton avatar de bronze.', category: 'badge_frame', icon: '🥉', cost: 70, unlockLevel: 0, assetId: 'frame:bronze' },
	{ key: 'frame_silver', name: 'Cadre Argent', description: 'Un cadre argenté élégant.', category: 'badge_frame', icon: '🥈', cost: 200, unlockLevel: 12, assetId: 'frame:silver' },
	{ key: 'frame_gold', name: 'Cadre Or', description: 'Le cadre des grands accomplissements.', category: 'badge_frame', icon: '🥇', cost: 500, unlockLevel: 24, assetId: 'frame:gold' }
] as const;

/** Récompenses "réelles" par défaut (kind='real'). L'utilisateur les édite librement. */
export interface RealRewardSeed {
	name: string; // FR
	cost: number;
	icon: string;
}

export const REAL_REWARD_SEEDS: readonly RealRewardSeed[] = [
	{ name: 'Une séance ciné', cost: 500, icon: '🎬' },
	{ name: 'Un bon restaurant', cost: 800, icon: '🍽️' },
	{ name: 'Un jeu vidéo que je veux', cost: 1500, icon: '🎮' },
	{ name: 'Une journée 100 % détente', cost: 1000, icon: '🛋️' },
	{ name: 'Un nouveau livre', cost: 300, icon: '📚' },
	{ name: 'Une sortie nature / rando', cost: 400, icon: '🥾' }
] as const;

/** Un cosmétique est-il achetable pour ce niveau et ce solde ? */
export function canPurchase(item: CosmeticItem, level: number, coins: number): boolean {
	return level >= item.unlockLevel && coins >= item.cost;
}
