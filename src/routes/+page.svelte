<script lang="ts">
	import type { PageData } from './$types';
	import { gameState } from '$lib/stores/gameState.svelte';
	import HabitRow from '$lib/components/habits/HabitRow.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Hydrate l'état partagé depuis le SSR (et à chaque rechargement de données).
	$effect(() => {
		gameState.hydrate(data);
	});

	const remaining = $derived(
		data.today.habits.filter((h) => gameState.today[h.habit.id]?.logStatus == null).length
	);

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}
</script>

<svelte:head><title>Aujourd'hui · HabitQuest</title></svelte:head>

<header class="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
	<div class="mx-auto flex max-w-md flex-col gap-2 px-4 pb-3 pt-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span
					class="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-slate-950"
				>
					{gameState.level.level}
				</span>
				<div class="leading-tight">
					<div class="text-sm font-semibold">Niveau {gameState.level.level}</div>
					<div class="text-xs text-slate-400">
						{gameState.level.intoLevel} / {gameState.level.needed} XP
					</div>
				</div>
			</div>
			<div class="flex items-center gap-3">
				<span class="inline-flex items-center gap-1 font-semibold text-coin">
					🪙 {gameState.user.coins}
				</span>
				<button class="text-xs text-slate-400 hover:text-slate-200" onclick={logout}>Déconnexion</button>
			</div>
		</div>
		<div class="h-2 overflow-hidden rounded-full bg-surface-2">
			<div
				class="h-full rounded-full bg-gradient-to-r from-xp to-primary transition-all duration-500"
				style="width: {gameState.xpPercent}%"
			></div>
		</div>
	</div>
</header>

<main class="mx-auto flex max-w-md flex-col gap-3 px-4 pb-24 pt-4">
	<div class="flex items-baseline justify-between">
		<h1 class="text-xl font-extrabold tracking-tight">Aujourd'hui</h1>
		<span class="text-sm text-slate-400">
			{#if remaining === 0}Tout est fait 🎉{:else}{remaining} à valider{/if}
		</span>
	</div>

	{#if data.today.habits.length === 0}
		<div class="card flex flex-col items-center gap-3 py-10 text-center">
			<div class="text-4xl">🌱</div>
			<p class="text-slate-300">Aucune habitude pour l'instant.</p>
			<a href="/habitudes" class="btn-primary">Créer ma première habitude</a>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each data.today.habits as h (h.habit.id)}
				<HabitRow habit={h.habit} />
			{/each}
		</div>
		<a
			href="/habitudes"
			class="mt-2 rounded-xl border border-dashed border-border py-3 text-center text-sm text-slate-400 hover:text-slate-200"
		>
			Gérer mes habitudes
		</a>
	{/if}
</main>
