<script lang="ts">
	import type { PageData } from './$types';
	import { gameState } from '$lib/stores/gameState.svelte';
	import { celebration, celebrateFromDelta } from '$lib/stores/celebration.svelte';
	import { claimQuest, ApiFailure } from '$lib/client/api';
	import AvatarCard from '$lib/components/game/AvatarCard.svelte';
	import Armurerie from '$lib/components/game/Armurerie.svelte';
	import HabitRow from '$lib/components/habits/HabitRow.svelte';
	import QuestList from '$lib/components/quests/QuestList.svelte';
	import TaskSection from '$lib/components/tasks/TaskSection.svelte';

	let { data }: { data: PageData } = $props();

	let armoryOpen = $state(false);

	const habits = $derived(data.today.habits);
	const remaining = $derived(
		habits.filter((h) => gameState.today[h.habit.id]?.logStatus == null).length
	);
	const dailyQuests = $derived(gameState.quests.filter((q) => q.scope === 'daily'));
	const weeklyQuests = $derived(gameState.quests.filter((q) => q.scope === 'weekly'));

	async function onclaim(id: number) {
		try {
			const { delta, quests } = await claimQuest(id);
			gameState.reconcile(delta);
			gameState.setQuests(quests);
			celebration.toast('Récompense réclamée ! 🎁', 'gold');
			celebrateFromDelta(delta);
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Réclamation impossible.', 'danger');
		}
	}
</script>

<svelte:head><title>Aujourd'hui · HabitQuest</title></svelte:head>

<div class="flex flex-col gap-4">
	<!-- Avatar cliquable → L'Armurerie -->
	<button
		type="button"
		class="group block w-full rounded border-0 bg-transparent p-0 text-left"
		onclick={() => (armoryOpen = true)}
		aria-label="Personnaliser mon chevalier (L'Armurerie)"
	>
		<AvatarCard
			level={gameState.level.level}
			intoLevel={gameState.level.intoLevel}
			needed={gameState.level.needed}
			coins={gameState.user.coins}
			prestige={gameState.level.prestige}
			topStreak={gameState.globalStreak}
			accessory={data.equippedCosmetics.accessory}
			name={data.playerName}
		/>
		<div class="mt-1 text-center text-xs text-muted group-hover:text-ink">
			✎ Personnaliser mon chevalier
		</div>
	</button>

	<QuestList quests={dailyQuests} {onclaim} title="Quêtes du jour" />
	<QuestList quests={weeklyQuests} {onclaim} title="Quêtes de la semaine" />

	<section class="flex flex-col gap-2">
		<div class="flex items-baseline justify-between">
			<h1 class="text-xl font-extrabold tracking-tight">Aujourd'hui</h1>
			<span class="text-sm text-muted">
				{#if habits.length === 0}—{:else if remaining === 0}Tout est fait 🎉{:else}{remaining} à valider{/if}
			</span>
		</div>

		{#if habits.length === 0}
			<div class="card flex flex-col items-center gap-3 py-10 text-center">
				<div class="text-4xl">🌱</div>
				<p class="text-muted">Aucune habitude pour l'instant.</p>
				<a href="/habitudes" class="btn-primary">Créer ma première habitude</a>
			</div>
		{:else}
			{#each habits as h (h.habit.id)}
				<HabitRow habit={h.habit} />
			{/each}
			<a
				href="/habitudes"
				class="mt-1 rounded-lg border border-dashed border-border py-3 text-center text-sm text-muted hover:text-ink"
			>
				Gérer mes habitudes
			</a>
		{/if}
	</section>

	<!-- Feature 1 — tâches ponctuelles (section séparée des habitudes récurrentes) -->
	<TaskSection tasks={data.tasks} doneTasks={data.doneTasks} />
</div>

<Armurerie
	open={armoryOpen}
	onclose={() => (armoryOpen = false)}
	level={gameState.level.level}
	prestige={gameState.level.prestige}
	topStreak={gameState.globalStreak}
	accessory={data.equippedCosmetics.accessory}
	playerName={data.playerName}
	cosmetics={data.cosmetics}
	ownedIds={data.ownedIds}
	equippedIds={data.equippedIds}
/>
