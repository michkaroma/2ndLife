// src/lib/content/fr.ts — petites listes de contenu FR partagées.

export const COMMON_TRIGGERS = [
	'Stress',
	'Ennui',
	'Soirée',
	'Café',
	'Après le repas',
	'Émotion forte',
	'Fatigue',
	'Habitude',
	'Entourage'
] as const;

// Comportementaux en premier (ordre d'affichage dans le formulaire).
export const ADDICTION_KINDS = [
	{ value: 'reseaux', label: 'Réseaux sociaux / scroll', icon: '📱', behavioral: true },
	{ value: 'jeux', label: 'Jeux vidéo', icon: '🎮', behavioral: true },
	{ value: 'ecrans', label: 'Écrans (général)', icon: '🖥️', behavioral: true },
	{ value: 'tabac', label: 'Tabac', icon: '🚬', behavioral: false },
	{ value: 'alcool', label: 'Alcool', icon: '🍷', behavioral: false },
	{ value: 'sucre', label: 'Sucre / malbouffe', icon: '🍩', behavioral: false },
	{ value: 'autre', label: 'Autre', icon: '👾', behavioral: false }
] as const;

export type AddictionKindValue = (typeof ADDICTION_KINDS)[number]['value'];
