<script lang="ts">
	import type { OneTimeTask, NewOneTimeTask, Difficulty } from '$lib/types';
	import { oneTimeTaskXp } from '$lib/config/progression';

	let {
		task = undefined,
		onsubmit,
		oncancel,
		submitting = false
	}: {
		task?: OneTimeTask;
		onsubmit: (values: NewOneTimeTask) => void;
		oncancel?: () => void;
		submitting?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	const initial = task; // capture unique
	let title = $state(initial?.title ?? '');
	let note = $state(initial?.note ?? '');
	let dueDate = $state(initial?.due_date ?? '');
	let difficulty = $state<Difficulty>(initial?.difficulty ?? 1);

	const DIFF_LABELS = ['Rapide', 'Moyenne', 'Ambitieuse'];

	function submit(e: Event) {
		e.preventDefault();
		if (!title.trim()) return;
		onsubmit({
			title: title.trim(),
			note: note.trim() || null,
			due_date: dueDate || null,
			difficulty
		});
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<div>
		<label class="mb-1 block text-sm text-muted" for="tf-title">Titre</label>
		<input
			id="tf-title"
			class="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 outline-none focus:border-primary"
			bind:value={title}
			placeholder="ex : Prendre rendez-vous chez le dentiste"
			maxlength="80"
			required
		/>
	</div>

	<div>
		<label class="mb-1 block text-sm text-muted" for="tf-note">Note (optionnel)</label>
		<textarea
			id="tf-note"
			class="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 outline-none focus:border-primary"
			bind:value={note}
			rows="2"
			maxlength="280"
			placeholder="Un détail à ne pas oublier…"
		></textarea>
	</div>

	<div>
		<label class="mb-1 block text-sm text-muted" for="tf-due">Date cible (optionnel, sans pénalité)</label>
		<input
			id="tf-due"
			type="date"
			class="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 outline-none focus:border-primary"
			bind:value={dueDate}
		/>
	</div>

	<div>
		<span class="mb-1 block text-sm text-muted">Ampleur (détermine l'XP)</span>
		<div class="grid grid-cols-3 gap-2">
			{#each [1, 2, 3] as d (d)}
				<button
					type="button"
					class="flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-sm font-medium transition"
					class:border-primary={difficulty === d}
					class:bg-primary={difficulty === d}
					class:text-white={difficulty === d}
					class:border-border={difficulty !== d}
					onclick={() => (difficulty = d as Difficulty)}
				>
					<span>{DIFF_LABELS[d - 1]}</span>
					<span class="text-xs opacity-80">+{oneTimeTaskXp(d)} XP</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="mt-1 flex gap-2">
		<button type="submit" class="btn-primary flex-1" disabled={submitting || !title.trim()}>
			{task ? 'Enregistrer' : 'Ajouter'}
		</button>
		{#if oncancel}
			<button type="button" class="btn-ghost" onclick={oncancel}>Annuler</button>
		{/if}
	</div>
</form>
