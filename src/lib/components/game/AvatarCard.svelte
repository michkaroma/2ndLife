<script lang="ts">
	import { avatarAppearance } from '$lib/config/avatar';
	import AvatarSprite from './AvatarSprite.svelte';
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
		accessory = undefined,
		name = null
	}: {
		level: number;
		intoLevel: number;
		needed: number;
		coins: number;
		prestige?: number;
		topStreak?: number;
		accessory?: Reward | null;
		name?: string | null;
	} = $props();

	const appearance = $derived(avatarAppearance(level, topStreak, prestige));
	const customName = $derived(name && name.trim() ? name.trim() : null);
</script>

<div class="card flex flex-col items-center gap-3 text-center">
	<AvatarSprite {level} {prestige} {topStreak} {accessory} />

	<div>
		<div class="font-display text-base font-bold">{customName ?? appearance.stage.name}</div>
		<div class="text-xs text-muted">
			{#if customName}{appearance.stage.name} · {/if}{appearance.stage.description}
		</div>
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
