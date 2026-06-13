<script lang="ts">
	import { avatarAppearance } from '$lib/config/avatar';
	import LevelBadge from './LevelBadge.svelte';
	import XpBar from './XpBar.svelte';
	import StreakFlame from './StreakFlame.svelte';

	let {
		level,
		intoLevel,
		needed,
		coins,
		prestige = 0,
		name = 'Compagnon',
		topStreak = 0,
		accessory = undefined
	}: {
		level: number;
		intoLevel: number;
		needed: number;
		coins: number;
		prestige?: number;
		name?: string;
		topStreak?: number;
		accessory?: string;
	} = $props();

	const appearance = $derived(avatarAppearance(level, topStreak, prestige));
</script>

<div class="card flex flex-col items-center gap-3 text-center">
	<div class="relative">
		<div
			class="grid h-24 w-24 place-items-center rounded-pill bg-gradient-to-br from-surface2 to-bg text-5xl shadow-glow"
			class:animate-wiggle={topStreak >= 7}
		>
			{appearance.stage.emoji}
		</div>
		{#if appearance.prestigeHalo}
			<div class="pointer-events-none absolute -inset-1 rounded-pill ring-2 ring-gold/60"></div>
		{/if}
		<div class="absolute -bottom-1 -right-1">
			<LevelBadge {level} {prestige} size="md" />
		</div>
		<div class="absolute -left-1 -top-1 text-2xl" title={appearance.mood.label}>
			{appearance.mood.overlayEmoji}
		</div>
		{#if accessory}
			<div class="absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-pill bg-surface2 text-lg shadow-card" title="Cosmétique équipé">
				{accessory}
			</div>
		{/if}
	</div>

	<div>
		<div class="text-lg font-bold">{appearance.stage.name}</div>
		<div class="text-xs text-muted">{appearance.stage.description}</div>
	</div>

	<div class="w-full">
		<XpBar {intoLevel} {needed} />
	</div>

	<div class="flex items-center gap-3 text-sm">
		<span class="inline-flex items-center gap-1 text-gold">🪙 {coins.toLocaleString('fr-FR')}</span>
		{#if topStreak > 0}
			<span class="text-border">·</span>
			<StreakFlame days={topStreak} showLabel />
		{/if}
	</div>
</div>
