<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { dur } from '$lib/motion';
	import { apiFetch, ApiFailure } from '$lib/client/api';
	import { celebration } from '$lib/stores/celebration.svelte';
	import { invalidateAll } from '$app/navigation';
	import AvatarSprite from './AvatarSprite.svelte';
	import type { Reward, CosmeticSlot } from '$lib/types';

	let {
		open,
		onclose,
		level,
		prestige = 0,
		topStreak = 0,
		accessory = null,
		playerName = null,
		cosmetics,
		ownedIds,
		equippedIds
	}: {
		open: boolean;
		onclose: () => void;
		level: number;
		prestige?: number;
		topStreak?: number;
		accessory?: Reward | null;
		playerName?: string | null;
		cosmetics: Reward[];
		ownedIds: number[];
		equippedIds: Record<CosmeticSlot, number | null>;
	} = $props();

	const CATEGORIES: { slot: CosmeticSlot; label: string; icon: string }[] = [
		{ slot: 'avatar_skin', label: 'Tenue', icon: '🎽' },
		{ slot: 'accessory', label: 'Accessoire', icon: '🎩' },
		{ slot: 'badge_frame', label: 'Cadre', icon: '🖼️' },
		{ slot: 'theme', label: 'Thème', icon: '🎨' }
	];

	let busy = $state(false);
	let nameDraft = $state('');
	// (Ré)initialise le brouillon de nom à l'ouverture / après sauvegarde.
	$effect(() => {
		if (open) nameDraft = playerName ?? '';
	});

	const isOwned = (id: number) => ownedIds.includes(id);
	const ownedItemsFor = (slot: CosmeticSlot) =>
		cosmetics.filter((c) => c.category === slot && isOwned(c.id));
	const lockedCountFor = (slot: CosmeticSlot) =>
		cosmetics.filter((c) => c.category === slot && !isOwned(c.id)).length;

	async function equip(r: Reward) {
		if (busy) return;
		busy = true;
		try {
			await apiFetch(`/api/rewards/${r.id}/equip`, { method: 'POST' });
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Impossible à équiper.', 'danger');
		} finally {
			busy = false;
		}
	}

	async function unequip(slot: CosmeticSlot) {
		const current = equippedIds[slot];
		if (busy || current == null) return;
		busy = true;
		try {
			await apiFetch(`/api/rewards/${current}/equip`, { method: 'DELETE' });
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Action impossible.', 'danger');
		} finally {
			busy = false;
		}
	}

	async function saveName() {
		if (busy) return;
		busy = true;
		try {
			await apiFetch('/api/character', { method: 'POST', body: JSON.stringify({ name: nameDraft }) });
			await invalidateAll();
			celebration.toast('Nom enregistré ✓', 'success');
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Enregistrement impossible.', 'danger');
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
		transition:fade={{ duration: dur(180) }}
		onclick={onclose}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		role="presentation"
	>
		<div
			class="card flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden p-0"
			transition:scale={{ start: 0.96, duration: dur(200) }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label="L'Armurerie"
			tabindex="-1"
		>
			<!-- En-tête -->
			<div class="flex items-center justify-between border-b-2 border-border px-4 py-3">
				<h2 class="font-display text-sm font-bold">🛡️ L'Armurerie</h2>
				<button class="btn-icon text-lg" onclick={onclose} aria-label="Fermer">✕</button>
			</div>

			<div class="flex flex-col gap-4 overflow-y-auto px-4 py-4">
				<!-- Aperçu + nom -->
				<div class="flex flex-col items-center gap-2">
					<AvatarSprite {level} {prestige} {topStreak} {accessory} size="lg" />
				</div>

				<div>
					<label class="label" for="ar-name">Nom du personnage</label>
					<div class="flex gap-2">
						<input
							id="ar-name"
							class="input flex-1"
							bind:value={nameDraft}
							maxlength="24"
							placeholder="Mon chevalier"
						/>
						<button class="btn-primary" onclick={saveName} disabled={busy}>OK</button>
					</div>
					<p class="mt-1 text-xs text-muted">Laisse vide pour revenir au nom de stade.</p>
				</div>

				<!-- Slots par catégorie -->
				{#each CATEGORIES as cat (cat.slot)}
					{@const owned = ownedItemsFor(cat.slot)}
					{@const locked = lockedCountFor(cat.slot)}
					<div>
						<div class="mb-1.5 flex items-center justify-between">
							<span class="text-sm font-semibold">{cat.icon} {cat.label}</span>
							{#if locked > 0}
								<a href="/boutique" class="text-xs text-muted hover:text-primary">
									+{locked} en boutique →
								</a>
							{/if}
						</div>

						<div class="flex flex-wrap gap-2">
							<!-- Aucun (déséquiper) -->
							<button
								class="pill border-2 transition disabled:opacity-50"
								class:border-primary={equippedIds[cat.slot] == null}
								class:bg-primary={equippedIds[cat.slot] == null}
								class:text-white={equippedIds[cat.slot] == null}
								class:border-border={equippedIds[cat.slot] != null}
								onclick={() => unequip(cat.slot)}
								disabled={busy || equippedIds[cat.slot] == null}
							>
								Aucun
							</button>

							{#each owned as item (item.id)}
								{@const isEquipped = equippedIds[cat.slot] === item.id}
								<button
									class="pill border-2 transition disabled:opacity-50"
									class:border-primary={isEquipped}
									class:bg-primary={isEquipped}
									class:text-white={isEquipped}
									class:border-border={!isEquipped}
									onclick={() => (isEquipped ? unequip(cat.slot) : equip(item))}
									disabled={busy}
									title={item.description ?? item.name}
								>
									<span>{item.icon}</span>
									<span>{item.name}</span>
									{#if isEquipped}<span aria-hidden="true">✓</span>{/if}
								</button>
							{/each}
						</div>

						{#if owned.length === 0}
							<p class="mt-1 text-xs text-muted">Rien de possédé pour l'instant.</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
