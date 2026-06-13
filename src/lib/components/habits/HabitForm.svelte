<script lang="ts">
	import type { Habit, HabitType, Difficulty, NewHabit } from '$lib/types';

	let {
		habit = undefined,
		onsubmit,
		oncancel,
		submitting = false
	}: {
		habit?: Habit;
		onsubmit: (values: NewHabit) => void;
		oncancel?: () => void;
		submitting?: boolean;
	} = $props();

	// Copie éditable, initialisée une fois depuis le prop (formulaire indépendant ;
	// l'instance est recréée à chaque édition via un bloc conditionnel clé).
	// svelte-ignore state_referenced_locally
	const initial = habit;
	let name = $state(initial?.name ?? '');
	let type = $state<HabitType>(initial?.type ?? 'build');
	let category = $state(initial?.category ?? '');
	let difficulty = $state<Difficulty>(initial?.difficulty ?? 1);
	let icon = $state(initial?.icon ?? '');

	const DIFF_LABELS = ['Facile', 'Moyenne', 'Difficile'];
	const ICONS = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '🚭', '🍷', '🍩', '📵', '🎯', '🪥'];

	function submit(e: Event) {
		e.preventDefault();
		if (!name.trim()) return;
		onsubmit({
			name: name.trim(),
			type,
			category: category.trim() || null,
			difficulty,
			icon: icon || null
		});
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<div>
		<label class="mb-1 block text-sm text-slate-400" for="hf-name">Nom</label>
		<input
			id="hf-name"
			class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 outline-none focus:border-primary"
			bind:value={name}
			placeholder="ex : Boire 2 L d'eau"
			maxlength="60"
			required
		/>
	</div>

	<div>
		<span class="mb-1 block text-sm text-slate-400">Type</span>
		<div class="grid grid-cols-2 gap-2">
			<button
				type="button"
				class="rounded-xl border px-3 py-2.5 font-medium transition"
				class:border-primary={type === 'build'}
				class:bg-primary={type === 'build'}
				class:text-slate-950={type === 'build'}
				class:border-border={type !== 'build'}
				onclick={() => (type = 'build')}
			>
				✨ À construire
			</button>
			<button
				type="button"
				class="rounded-xl border px-3 py-2.5 font-medium transition"
				class:border-primary={type === 'break'}
				class:bg-primary={type === 'break'}
				class:text-slate-950={type === 'break'}
				class:border-border={type !== 'break'}
				onclick={() => (type = 'break')}
			>
				🚫 À arrêter
			</button>
		</div>
	</div>

	<div>
		<label class="mb-1 block text-sm text-slate-400" for="hf-cat">Catégorie (optionnel)</label>
		<input
			id="hf-cat"
			class="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 outline-none focus:border-primary"
			bind:value={category}
			placeholder="ex : Santé"
			maxlength="40"
		/>
	</div>

	<div>
		<span class="mb-1 block text-sm text-slate-400">Difficulté (multiplie l'XP)</span>
		<div class="grid grid-cols-3 gap-2">
			{#each [1, 2, 3] as d (d)}
				<button
					type="button"
					class="rounded-xl border px-3 py-2.5 text-sm font-medium transition"
					class:border-primary={difficulty === d}
					class:bg-primary={difficulty === d}
					class:text-slate-950={difficulty === d}
					class:border-border={difficulty !== d}
					onclick={() => (difficulty = d as Difficulty)}
				>
					{DIFF_LABELS[d - 1]}
				</button>
			{/each}
		</div>
	</div>

	<div>
		<span class="mb-1 block text-sm text-slate-400">Icône</span>
		<div class="flex flex-wrap gap-2">
			{#each ICONS as ic (ic)}
				<button
					type="button"
					class="grid h-10 w-10 place-items-center rounded-xl border text-xl transition"
					class:border-primary={icon === ic}
					class:bg-surface-2={icon === ic}
					class:border-border={icon !== ic}
					onclick={() => (icon = icon === ic ? '' : ic)}
				>
					{ic}
				</button>
			{/each}
		</div>
	</div>

	<div class="mt-2 flex gap-2">
		<button type="submit" class="btn-primary flex-1" disabled={submitting || !name.trim()}>
			{habit ? 'Enregistrer' : 'Créer'}
		</button>
		{#if oncancel}
			<button type="button" class="btn-ghost" onclick={oncancel}>Annuler</button>
		{/if}
	</div>
</form>
