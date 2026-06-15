<script lang="ts">
	import type { Reward } from '$lib/types';
	import RewardCard from './RewardCard.svelte';

	let {
		rewards,
		coins,
		level,
		ownedIds,
		equippedIds,
		onbuy,
		onequip,
		ondelete
	}: {
		rewards: Reward[];
		coins: number;
		level: number;
		ownedIds: number[];
		equippedIds: Record<string, number | null>;
		onbuy: (r: Reward) => void;
		onequip: (r: Reward) => void;
		ondelete: (r: Reward) => void;
	} = $props();

	const cosmetics = $derived(rewards.filter((r) => r.kind === 'cosmetic'));
	const reals     = $derived(rewards.filter((r) => r.kind === 'real'));

	function isEquipped(r: Reward): boolean {
		if (!r.category) return false;
		return equippedIds[r.category] === r.id;
	}
</script>

<div class="flex flex-col gap-4">
	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-bold">Cosmétiques</h2>
		<div class="grid grid-cols-2 gap-2">
			{#each cosmetics as r (r.id)}
				<RewardCard
					reward={r}
					{level}
					{coins}
					owned={ownedIds.includes(r.id)}
					equipped={isEquipped(r)}
					{onbuy}
					{onequip}
				/>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-bold">Mes récompenses</h2>
		{#if reals.length === 0}
			<div class="card py-6 text-center text-sm text-muted">
				Ajoute une récompense à t'offrir avec tes pièces.
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-2">
				{#each reals as r (r.id)}
					<RewardCard reward={r} {level} {coins} {onbuy} {ondelete} onequip={() => {}} />
				{/each}
			</div>
		{/if}
	</section>
</div>
