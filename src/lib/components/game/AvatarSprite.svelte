<script lang="ts">
	// Rendu visuel du personnage (sprite en calques + accessoire + cadre/humeur).
	// Extrait d'AvatarCard pour être réutilisé tel quel par l'Armurerie (Feature 2).
	import { avatarAppearance } from '$lib/config/avatar';
	import { spriteFor } from '$lib/config/sprites';
	import LevelBadge from './LevelBadge.svelte';
	import type { Reward } from '$lib/types';

	let {
		level,
		prestige = 0,
		topStreak = 0,
		accessory = undefined,
		size = 'md'
	}: {
		level: number;
		prestige?: number;
		topStreak?: number;
		accessory?: Reward | null;
		size?: 'md' | 'lg';
	} = $props();

	const appearance = $derived(avatarAppearance(level, topStreak, prestige));
	const baseSprite = $derived(spriteFor(appearance.stage.assetId));
	const accSprite = $derived(accessory?.asset_id ? spriteFor(accessory.asset_id) : null);

	// fallback emoji si le sprite n'a pas pu charger
	let baseError = $state(false);
	let accError = $state(false);
	$effect(() => {
		void appearance.stage.assetId; // réinitialise si le sprite de base change
		baseError = false;
	});
	$effect(() => {
		void accessory?.asset_id; // réinitialise si l'accessoire change
		accError = false;
	});

	const box = $derived(size === 'lg' ? 'h-32 w-32' : 'h-24 w-24');
	const baseImg = $derived(size === 'lg' ? 'h-28 w-28' : 'h-20 w-20');
	const moodText = $derived(size === 'lg' ? 'text-2xl' : 'text-xl');
	const badgeSize: 'md' | 'lg' = $derived(size === 'lg' ? 'lg' : 'md');
</script>

<div class="relative">
	<!-- Cadre + aura d'humeur -->
	<div
		class="relative grid {box} place-items-center rounded-2xl
			{appearance.mood.auraClass ?? 'aura-none'}
			{topStreak >= 7 ? 'animate-wiggle' : ''}"
		style="background: linear-gradient(135deg, rgb(var(--c-surface-2)), rgb(var(--c-bg)))"
	>
		<!-- Couche ARRIÈRE (back accessories : ailes, auréole) -->
		{#if accSprite && accSprite.layer === 'back' && !accError}
			<img
				src={accSprite.path}
				alt={accessory?.name ?? ''}
				class="pointer-events-none absolute inset-0 h-full w-full object-contain"
				style="image-rendering: pixelated"
				onerror={() => (accError = true)}
			/>
		{/if}

		<!-- Base : sprite du stade ou emoji fallback -->
		{#if baseSprite && !baseError}
			<img
				src={baseSprite.path}
				alt={appearance.stage.name}
				class="{baseImg} object-contain"
				style="image-rendering: pixelated"
				onerror={() => (baseError = true)}
			/>
		{:else}
			<span class="text-5xl select-none">{appearance.stage.emoji}</span>
		{/if}

		<!-- Couche AVANT (front accessories : casquette, lunettes, couronne) -->
		{#if accSprite && accSprite.layer === 'front' && !accError}
			<img
				src={accSprite.path}
				alt={accessory?.name ?? ''}
				class="pointer-events-none absolute inset-0 h-full w-full object-contain"
				style="image-rendering: pixelated"
				onerror={() => (accError = true)}
			/>
		{/if}

		<!-- Fallback accessoire : pastille emoji si sprite absent -->
		{#if accessory && accError}
			<span
				class="absolute -bottom-1 -left-1 grid h-7 w-7 place-items-center rounded-full bg-surface2 text-base shadow-card"
				title={accessory.name}
			>{accessory.icon}</span>
		{/if}
	</div>

	<!-- Halo prestige -->
	{#if appearance.prestigeHalo}
		<div class="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-gold/60"></div>
	{/if}

	<!-- Badge de niveau -->
	<div class="absolute -bottom-1 -right-1">
		<LevelBadge {level} {prestige} size={badgeSize} />
	</div>

	<!-- Humeur -->
	<div class="absolute -left-1 -top-1 {moodText}" title={appearance.mood.label}>
		{appearance.mood.overlayEmoji}
	</div>
</div>

<style>
	.aura-none {
		box-shadow: none;
	}
	.aura-soft {
		box-shadow: 0 0 8px 1px rgb(var(--c-accent) / 0.15);
	}
	.aura-warm {
		box-shadow: 0 0 12px 2px rgb(var(--c-flame) / 0.25);
	}
	.aura-fire {
		box-shadow: 0 0 18px 4px rgb(var(--c-flame) / 0.45);
	}
	.aura-radiant {
		box-shadow: 0 0 24px 6px rgb(var(--c-gold) / 0.55);
	}
</style>
