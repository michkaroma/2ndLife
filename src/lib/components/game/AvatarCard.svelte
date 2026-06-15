<script lang="ts">
	import { avatarAppearance } from '$lib/config/avatar';
	import { spriteFor } from '$lib/config/sprites';
	import LevelBadge from './LevelBadge.svelte';
	import XpBar from './XpBar.svelte';
	import StreakFlame from './StreakFlame.svelte';
	import type { Reward } from '$lib/types';

	let {
		level,
		intoLevel,
		needed,
		coins,
		prestige = 0,
		topStreak = 0,
		accessory = undefined
	}: {
		level: number;
		intoLevel: number;
		needed: number;
		coins: number;
		prestige?: number;
		topStreak?: number;
		accessory?: Reward | null;
	} = $props();

	const appearance = $derived(avatarAppearance(level, topStreak, prestige));
	const baseSprite = $derived(spriteFor(appearance.stage.assetId));
	const accSprite  = $derived(accessory?.asset_id ? spriteFor(accessory.asset_id) : null);

	// fallback emoji si le sprite n'a pas pu charger
	let baseError = $state(false);
	let accError  = $state(false);

	$effect(() => {
		// Réinitialise les erreurs si le sprite change
		baseError = false;
	});
	$effect(() => {
		accError = false;
	});
</script>

<div class="card flex flex-col items-center gap-3 text-center">
	<div class="relative">
		<!-- Cadre (badge_frame) en anneau CSS -->
		<div
			class="relative grid h-24 w-24 place-items-center rounded-2xl
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
					class="h-20 w-20 object-contain"
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
			<LevelBadge {level} {prestige} size="md" />
		</div>

		<!-- Humeur -->
		<div class="absolute -left-1 -top-1 text-xl" title={appearance.mood.label}>
			{appearance.mood.overlayEmoji}
		</div>
	</div>

	<div>
		<div class="font-display text-base font-bold">{appearance.stage.name}</div>
		<div class="text-xs text-muted">{appearance.stage.description}</div>
	</div>

	<div class="w-full">
		<XpBar {intoLevel} {needed} />
	</div>

	<div class="flex items-center gap-3 text-sm">
		<span class="inline-flex items-center gap-1 text-gold font-display">🪙 {coins.toLocaleString('fr-FR')}</span>
		{#if topStreak > 0}
			<span class="text-border">·</span>
			<StreakFlame days={topStreak} showLabel />
		{/if}
	</div>
</div>

<style>
	.aura-none    { box-shadow: none; }
	.aura-soft    { box-shadow: 0 0 8px 1px rgb(var(--c-accent) / 0.15); }
	.aura-warm    { box-shadow: 0 0 12px 2px rgb(var(--c-flame) / 0.25); }
	.aura-fire    { box-shadow: 0 0 18px 4px rgb(var(--c-flame) / 0.45); }
	.aura-radiant { box-shadow: 0 0 24px 6px rgb(var(--c-gold) / 0.55); }
</style>
