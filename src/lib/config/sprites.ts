// src/lib/config/sprites.ts — résolveur assetId → chemin de sprite + couche.
// Les sprites sont dans static/sprites/ ; fallback emoji si absents.

export type SpriteLayer = 'front' | 'back';

export interface SpriteInfo {
	path: string;
	layer?: SpriteLayer; // accessoires uniquement
}

// Ordre = ordre de AVATAR_STAGES (recrue → legende)
const SPRITE_MAP: Record<string, SpriteInfo> = {
	// Bases (9 stades de chevalier)
	'avatar:recrue':    { path: '/sprites/knight/stage-1-recrue.svg' },
	'avatar:ecuyer':    { path: '/sprites/knight/stage-2-ecuyer.svg' },
	'avatar:apprenti':  { path: '/sprites/knight/stage-3-apprenti.svg' },
	'avatar:novice':    { path: '/sprites/knight/stage-4-novice.svg' },
	'avatar:chevalier': { path: '/sprites/knight/stage-5-chevalier.svg' },
	'avatar:gardien':   { path: '/sprites/knight/stage-6-gardien.svg' },
	'avatar:champion':  { path: '/sprites/knight/stage-7-champion.svg' },
	'avatar:paladin':   { path: '/sprites/knight/stage-8-paladin.svg' },
	'avatar:legende':   { path: '/sprites/knight/stage-9-legende.svg' },
	// Accessoires
	'acc:cap':     { path: '/sprites/accessory/cap.svg',     layer: 'front' },
	'acc:glasses': { path: '/sprites/accessory/glasses.svg', layer: 'front' },
	'acc:crown':   { path: '/sprites/accessory/crown.svg',   layer: 'front' },
	'acc:wings':   { path: '/sprites/accessory/wings.svg',   layer: 'back' },
	'acc:halo':    { path: '/sprites/accessory/halo.svg',    layer: 'back' }
};

export function spriteFor(assetId: string | null | undefined): SpriteInfo | null {
	if (!assetId) return null;
	return SPRITE_MAP[assetId] ?? null;
}
