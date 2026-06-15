// src/lib/config/avatar.ts
// Progression du chevalier : 9 stades par niveau, humeur par série.

export interface AvatarStage {
	key: string;
	name: string;       // FR
	minLevel: number;
	emoji: string;      // fallback si sprite absent
	assetId: string;
	description: string; // FR
}

export const AVATAR_STAGES: readonly AvatarStage[] = [
	{ key: 'recrue',    name: 'Recrue',           minLevel: 1,  emoji: '🪖', assetId: 'avatar:recrue',    description: 'Tout commence ici. Un chevalier en devenir.' },
	{ key: 'ecuyer',    name: 'Écuyer',            minLevel: 3,  emoji: '🛡️', assetId: 'avatar:ecuyer',    description: "Tu portes l'armure pour la première fois. Premiers pas !" },
	{ key: 'apprenti',  name: "Apprenti d'armes",  minLevel: 6,  emoji: '⚔️', assetId: 'avatar:apprenti',  description: "L'entraînement porte ses fruits, jour après jour." },
	{ key: 'novice',    name: 'Chevalier novice',  minLevel: 10, emoji: '🗡️', assetId: 'avatar:novice',    description: "Plein d'énergie, tu prends de l'assurance." },
	{ key: 'chevalier', name: 'Chevalier',         minLevel: 16, emoji: '⚔️', assetId: 'avatar:chevalier', description: "Aguerri par tes efforts, prêt à affronter les plus grands défis." },
	{ key: 'gardien',   name: 'Gardien',           minLevel: 24, emoji: '🛡️', assetId: 'avatar:gardien',   description: 'Fort et fiable, tu veilles sur tes habitudes avec sagesse.' },
	{ key: 'champion',  name: 'Champion',          minLevel: 34, emoji: '🏆', assetId: 'avatar:champion',  description: 'Un combattant de légende, né de ta constance.' },
	{ key: 'paladin',   name: 'Paladin',           minLevel: 45, emoji: '✨', assetId: 'avatar:paladin',   description: "Une aura rare t'entoure. Le sommet est proche." },
	{ key: 'legende',   name: 'Légende',           minLevel: 50, emoji: '👑', assetId: 'avatar:legende',   description: 'Le prestige est à portée. Tu as tout accompli.' }
] as const;

/** Humeur selon la série courante — jamais négative (§7 bienveillant). */
export type AvatarMoodKey = 'rest' | 'calm' | 'happy' | 'fired_up' | 'radiant';

export interface AvatarMood {
	key: AvatarMoodKey;
	minStreak: number;
	label: string;       // FR
	overlayEmoji: string;
	auraClass: string;
}

export const AVATAR_MOODS: readonly AvatarMood[] = [
	{ key: 'rest',     minStreak: 0,  label: 'Au repos',    overlayEmoji: '😌', auraClass: 'aura-none' },
	{ key: 'calm',     minStreak: 1,  label: 'Serein',      overlayEmoji: '🙂', auraClass: 'aura-soft' },
	{ key: 'happy',    minStreak: 3,  label: 'Joyeux',      overlayEmoji: '😊', auraClass: 'aura-warm' },
	{ key: 'fired_up', minStreak: 7,  label: 'Enflammé',    overlayEmoji: '🔥', auraClass: 'aura-fire' },
	{ key: 'radiant',  minStreak: 30, label: 'Rayonnant',   overlayEmoji: '🌟', auraClass: 'aura-radiant' }
] as const;

export function avatarStageForLevel(level: number): AvatarStage {
	let chosen = AVATAR_STAGES[0];
	for (const s of AVATAR_STAGES) if (level >= s.minLevel) chosen = s;
	return chosen;
}

export function avatarMoodForStreak(streakDays: number): AvatarMood {
	let chosen = AVATAR_MOODS[0];
	for (const m of AVATAR_MOODS) if (streakDays >= m.minStreak) chosen = m;
	return chosen;
}

export interface AvatarAppearance {
	stage: AvatarStage;
	mood: AvatarMood;
	prestigeHalo: boolean;
}

export function avatarAppearance(
	level: number,
	currentStreak: number,
	prestige: number
): AvatarAppearance {
	return {
		stage: avatarStageForLevel(level),
		mood: avatarMoodForStreak(currentStreak),
		prestigeHalo: prestige > 0
	};
}
