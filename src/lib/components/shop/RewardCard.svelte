<script lang="ts">
	import type { Reward } from '$lib/types';

	let {
		reward,
		level,
		coins,
		owned = false,
		equipped = false,
		onbuy,
		onequip,
		ondelete
	}: {
		reward: Reward;
		level: number;
		coins: number;
		owned?: boolean;
		equipped?: boolean;
		onbuy: (r: Reward) => void;
		onequip?: (r: Reward) => void;
		ondelete?: (r: Reward) => void;
	} = $props();

	const levelLocked = $derived(level < reward.min_level);
	const affordable  = $derived(coins >= reward.cost);
	const missing     = $derived(Math.max(0, reward.cost - coins));
</script>

<div class="card flex flex-col items-center gap-2 p-3 text-center" class:opacity-70={levelLocked}>
	<div class="text-3xl">{reward.icon ?? (reward.kind === 'cosmetic' ? '🎁' : '⭐')}</div>
	<div class="min-h-0">
		<div class="text-sm font-semibold leading-tight">{reward.name}</div>
		{#if reward.description}<div class="mt-0.5 text-xs text-muted">{reward.description}</div>{/if}
	</div>
	<span class="pill bg-gold/15 text-gold">🪙 {reward.cost}</span>

	{#if reward.kind === 'cosmetic'}
		{#if owned}
			{#if equipped}
				<span class="pill bg-health/15 text-health w-full justify-center">Équipé ✓</span>
			{:else}
				<button class="btn-ghost w-full" onclick={() => onequip?.(reward)}>Équiper</button>
			{/if}
		{:else if levelLocked}
			<span class="pill bg-surface2 text-muted">🔒 Niveau {reward.min_level}</span>
		{:else if affordable}
			<button class="btn-primary w-full" onclick={() => onbuy(reward)}>Acheter</button>
		{:else}
			<button class="btn w-full bg-surface2 text-muted" disabled>Manque {missing} 🪙</button>
		{/if}
	{:else if affordable}
		<button class="btn-primary w-full" onclick={() => onbuy(reward)}>Échanger</button>
	{:else}
		<button class="btn w-full bg-surface2 text-muted" disabled>Manque {missing} 🪙</button>
	{/if}

	{#if reward.kind === 'real' && ondelete}
		<button class="text-xs text-muted hover:text-danger" onclick={() => ondelete?.(reward)}>Retirer</button>
	{/if}
</div>
