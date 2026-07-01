// src/lib/config/shop.ts
// Économie de pièces (centralisée) + catalogue de la boutique.

export const COIN_ECONOMY = {
	PER_HABIT: 5,            // pièces par habitude "build" validée
	PER_CLEAN_DAY: 6,        // pièces par journée "clean" (habitude "break" ou check-in boss)
	PER_WEEKLY_CHECKIN: 3,   // pièces par check-in d'objectif hebdomadaire
	WEEKLY_QUOTA_BONUS: 12,  // pièces bonus à l'atteinte du quota hebdo (une fois / semaine)
	ONE_TIME_TASK: [4, 9, 16], // pièces par tâche ponctuelle selon la difficulté (index 0 = diff. 1)
	LEVEL_UP_BASE: 10,       // pièces de base à la montée de niveau
	LEVEL_UP_PER_LEVEL: 2,   // + par niveau atteint
	PRESTIGE_BONUS: 500      // bonus de pièces au prestige
} as const;

export function coinsForLevelUp(level: number): number {
	return COIN_ECONOMY.LEVEL_UP_BASE + level * COIN_ECONOMY.LEVEL_UP_PER_LEVEL;
}

/** Pièces d'une tâche ponctuelle selon sa difficulté (1..3). */
export function coinsForOneTimeTask(difficulty: number): number {
	const i = Math.min(Math.max(Math.round(difficulty), 1), 3) - 1;
	return COIN_ECONOMY.ONE_TIME_TASK[i];
}

export type ShopCategory = 'avatar_skin' | 'accessory' | 'theme' | 'badge_frame';
export type AccessoryLayer = 'front' | 'back';

export interface CosmeticItem {
	key: string;
	name: string;
	description: string;
	category: ShopCategory;
	icon: string;
	cost: number;
	unlockLevel: number;
	assetId: string;
	layer?: AccessoryLayer; // accessoires uniquement
}

export const COSMETICS: readonly CosmeticItem[] = [
	// Thèmes
	{ key: 'theme_midnight', name: 'Thème Minuit',    description: 'Un bleu nuit profond, sobre et reposant.',         category: 'theme',       icon: '🌌', cost: 80,  unlockLevel: 0,  assetId: 'theme:midnight' },
	{ key: 'theme_ember',    name: 'Thème Braise',    description: 'Des accents orange chaleureux.',                   category: 'theme',       icon: '🔥', cost: 150, unlockLevel: 5,  assetId: 'theme:ember' },
	{ key: 'theme_forest',   name: 'Thème Forêt',     description: 'Des verts apaisants pour rester ancré.',           category: 'theme',       icon: '🌿', cost: 150, unlockLevel: 8,  assetId: 'theme:forest' },
	{ key: 'theme_aurora',   name: 'Thème Aurore',    description: 'Dégradé violet et turquoise, hypnotique.',         category: 'theme',       icon: '🌠', cost: 350, unlockLevel: 15, assetId: 'theme:aurora' },
	{ key: 'theme_gold',     name: 'Thème Or royal',  description: 'Réservé aux légendes : touches dorées.',           category: 'theme',       icon: '👑', cost: 600, unlockLevel: 25, assetId: 'theme:gold' },
	// Skins
	{ key: 'skin_default_alt', name: 'Tenue alternative',  description: 'Une variante de couleur pour ton chevalier.', category: 'avatar_skin', icon: '🎨', cost: 100, unlockLevel: 0,  assetId: 'skin:alt' },
	{ key: 'skin_ninja',       name: 'Tenue Ninja',        description: 'Discret et déterminé.',                       category: 'avatar_skin', icon: '🥷', cost: 250, unlockLevel: 7,  assetId: 'skin:ninja' },
	{ key: 'skin_explorer',    name: 'Tenue Explorateur',  description: "Prêt pour l'aventure du quotidien.",          category: 'avatar_skin', icon: '🧭', cost: 250, unlockLevel: 10, assetId: 'skin:explorer' },
	{ key: 'skin_mage',        name: 'Tenue Mage',         description: 'Maîtrise la magie des bonnes habitudes.',     category: 'avatar_skin', icon: '🧙', cost: 400, unlockLevel: 18, assetId: 'skin:mage' },
	{ key: 'skin_celestial',   name: 'Tenue Céleste',      description: "Une aura d'étoiles pour les héros accomplis.", category: 'avatar_skin', icon: '✨', cost: 700, unlockLevel: 30, assetId: 'skin:celestial' },
	// Accessoires (un seul porté à la fois)
	{ key: 'acc_cap',     name: 'Casquette', description: 'Un petit couvre-chef décontracté.',       category: 'accessory', icon: '🧢', cost: 60,  unlockLevel: 0,  assetId: 'acc:cap',     layer: 'front' },
	{ key: 'acc_glasses', name: 'Lunettes',  description: "Pour voir l'avenir avec clarté.",          category: 'accessory', icon: '👓', cost: 90,  unlockLevel: 3,  assetId: 'acc:glasses', layer: 'front' },
	{ key: 'acc_crown',   name: 'Couronne',  description: 'Tu règnes sur tes habitudes.',              category: 'accessory', icon: '👑', cost: 300, unlockLevel: 20, assetId: 'acc:crown',   layer: 'front' },
	{ key: 'acc_wings',   name: 'Ailes',     description: 'Prends ton envol vers de nouveaux sommets.',category: 'accessory', icon: '🪽', cost: 500, unlockLevel: 28, assetId: 'acc:wings',   layer: 'back' },
	{ key: 'acc_halo',    name: 'Auréole',   description: 'La marque des prestiges.',                  category: 'accessory', icon: '😇', cost: 450, unlockLevel: 35, assetId: 'acc:halo',    layer: 'back' },
	// Cadres de badge
	{ key: 'frame_bronze', name: 'Cadre Bronze', description: 'Encadre ton chevalier de bronze.', category: 'badge_frame', icon: '🥉', cost: 70,  unlockLevel: 0,  assetId: 'frame:bronze' },
	{ key: 'frame_silver', name: 'Cadre Argent', description: 'Un cadre argenté élégant.',         category: 'badge_frame', icon: '🥈', cost: 200, unlockLevel: 12, assetId: 'frame:silver' },
	{ key: 'frame_gold',   name: 'Cadre Or',     description: 'Le cadre des grands accomplissements.', category: 'badge_frame', icon: '🥇', cost: 500, unlockLevel: 24, assetId: 'frame:gold' }
] as const;

export interface RealRewardSeed {
	name: string;
	cost: number;
	icon: string;
}

export const REAL_REWARD_SEEDS: readonly RealRewardSeed[] = [
	{ name: 'Une séance ciné',            cost: 500,  icon: '🎬' },
	{ name: 'Un bon restaurant',          cost: 800,  icon: '🍽️' },
	{ name: 'Un jeu vidéo que je veux',   cost: 1500, icon: '🎮' },
	{ name: 'Une journée 100 % détente',  cost: 1000, icon: '🛋️' },
	{ name: 'Un nouveau livre',           cost: 300,  icon: '📚' },
	{ name: 'Une sortie nature / rando',  cost: 400,  icon: '🥾' }
] as const;

export function canPurchase(item: CosmeticItem, level: number, coins: number): boolean {
	return level >= item.unlockLevel && coins >= item.cost;
}
