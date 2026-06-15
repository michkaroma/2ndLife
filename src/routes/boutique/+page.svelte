<script lang="ts">
	import type { PageData } from './$types';
	import type { Reward } from '$lib/types';
	import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';
	import CoinPill from '$lib/components/game/CoinPill.svelte';
	import { apiFetch, ApiFailure } from '$lib/client/api';
	import { celebration } from '$lib/stores/celebration.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let pending = $state<Reward | null>(null);
	let adding = $state(false);
	let newName = $state('');
	let newCost = $state(300);

	async function doBuy(r: Reward) {
		try {
			await apiFetch(`/api/rewards/${r.id}/claim`, { method: 'POST' });
			celebration.toast(
				r.kind === 'cosmetic' ? `« ${r.name} » débloqué ! 🎨` : `Profite bien : ${r.name} 🎉`,
				'gold'
			);
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Achat impossible.', 'danger');
		}
	}

	function onbuy(r: Reward) {
		if (r.kind === 'real') pending = r;
		else doBuy(r);
	}

	async function onequip(r: Reward) {
		try {
			await apiFetch(`/api/rewards/${r.id}/equip`, { method: 'POST' });
			celebration.toast(`« ${r.name} » équipé ✓`, 'success');
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Impossible à équiper.', 'danger');
		}
	}

	async function ondelete(r: Reward) {
		await apiFetch(`/api/rewards/${r.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function addReward(e: Event) {
		e.preventDefault();
		if (!newName.trim()) return;
		try {
			await apiFetch('/api/rewards', {
				method: 'POST',
				body: JSON.stringify({ name: newName.trim(), cost: newCost })
			});
			newName = '';
			newCost = 300;
			adding = false;
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Ajout impossible.', 'danger');
		}
	}
</script>

<svelte:head><title>Boutique · HabitQuest</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-extrabold tracking-tight">Boutique</h1>
		<CoinPill amount={data.coins} />
	</div>

	<ShopGrid
		rewards={data.rewards}
		coins={data.coins}
		level={data.level}
		ownedIds={data.ownedIds}
		equippedIds={data.equippedIds}
		{onbuy}
		{onequip}
		{ondelete}
	/>

	{#if adding}
		<form class="card flex flex-col gap-3" onsubmit={addReward}>
			<input
				class="input"
				bind:value={newName}
				placeholder="Nom de la récompense (ex : Sortie ciné)"
				maxlength="60"
				required
			/>
			<label class="label" for="rc">Coût en pièces</label>
			<input id="rc" class="input" type="number" min="1" bind:value={newCost} />
			<div class="flex gap-2">
				<button type="submit" class="btn-primary flex-1">Ajouter</button>
				<button type="button" class="btn-ghost" onclick={() => (adding = false)}>Annuler</button>
			</div>
		</form>
	{:else}
		<button class="btn-ghost" onclick={() => (adding = true)}>+ Ajouter une récompense</button>
	{/if}
</div>

<ConfirmDialog
	open={pending !== null}
	title="Échanger des pièces ?"
	body={pending ? `Dépenser ${pending.cost} pièces contre « ${pending.name} » ?` : ''}
	confirmLabel="Échanger"
	onconfirm={() => {
		const r = pending;
		pending = null;
		if (r) doBuy(r);
	}}
	oncancel={() => (pending = null)}
/>
