<script lang="ts">
	import type { PageData } from './$types';
	import type { Habit, NewHabit } from '$lib/types';
	import HabitForm from '$lib/components/habits/HabitForm.svelte';
	import { apiFetch, ApiFailure } from '$lib/client/api';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let editing = $state<Habit | null>(null);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function create(values: NewHabit) {
		submitting = true;
		error = null;
		try {
			await apiFetch('/api/habits', { method: 'POST', body: JSON.stringify(values) });
			creating = false;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiFailure ? e.message : 'Création impossible.';
		} finally {
			submitting = false;
		}
	}

	async function update(values: NewHabit) {
		if (!editing) return;
		submitting = true;
		error = null;
		try {
			await apiFetch(`/api/habits/${editing.id}`, { method: 'PUT', body: JSON.stringify(values) });
			editing = null;
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiFailure ? e.message : 'Modification impossible.';
		} finally {
			submitting = false;
		}
	}

	async function archive(h: Habit) {
		await apiFetch(`/api/habits/${h.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function unarchive(h: Habit) {
		await apiFetch(`/api/habits/${h.id}`, { method: 'PUT', body: JSON.stringify({ archived: false }) });
		await invalidateAll();
	}

	async function destroy(h: Habit) {
		if (!confirm(`Supprimer définitivement « ${h.name} » et son historique ?`)) return;
		await apiFetch(`/api/habits/${h.id}?hard=1`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Habitudes · HabitQuest</title></svelte:head>

<main class="mx-auto flex max-w-md flex-col gap-4 px-4 pb-24 pt-4">
	<div class="flex items-center justify-between">
		<a href="/" class="text-sm text-muted hover:text-slate-200">← Aujourd'hui</a>
		<h1 class="text-xl font-extrabold">Mes habitudes</h1>
		<button class="text-sm font-semibold text-primary" onclick={() => { creating = !creating; editing = null; }}>
			{creating ? 'Fermer' : '+ Nouvelle'}
		</button>
	</div>

	{#if error}<div class="rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">{error}</div>{/if}

	{#if creating}
		<div class="card"><HabitForm onsubmit={create} oncancel={() => (creating = false)} {submitting} /></div>
	{/if}

	{#each data.active as h (h.id)}
		{#if editing?.id === h.id}
			<div class="card">
				<HabitForm habit={h} onsubmit={update} oncancel={() => (editing = null)} {submitting} />
			</div>
		{:else}
			<div class="card flex items-center gap-3">
				<span class="grid h-10 w-10 place-items-center rounded-xl bg-surface2 text-xl">
					{h.icon ?? (h.type === 'break' ? '🚫' : '✨')}
				</span>
				<div class="min-w-0 flex-1">
					<div class="truncate font-semibold">{h.name}</div>
					<div class="text-xs text-muted">
						{h.type === 'break' ? 'À arrêter' : 'À construire'}
						{#if h.frequency_type === 'weekly'}· {h.weekly_quota}×/sem.{/if}
						{#if h.category}· {h.category}{/if} · diff. {h.difficulty}
					</div>
				</div>
				<button class="btn-ghost px-3 py-1.5 text-sm" onclick={() => { editing = h; creating = false; }}>
					Modifier
				</button>
				<button class="btn-ghost px-3 py-1.5 text-sm" onclick={() => archive(h)} title="Archiver">📥</button>
			</div>
		{/if}
	{/each}

	{#if data.active.length === 0 && !creating}
		<div class="card py-8 text-center text-muted">Aucune habitude active.</div>
	{/if}

	{#if data.archived.length > 0}
		<h2 class="mt-4 text-sm font-semibold text-muted">Archivées</h2>
		{#each data.archived as h (h.id)}
			<div class="card flex items-center gap-3 opacity-70">
				<span class="grid h-10 w-10 place-items-center rounded-xl bg-surface2 text-xl">
					{h.icon ?? '📦'}
				</span>
				<div class="min-w-0 flex-1 truncate font-semibold">{h.name}</div>
				<button class="btn-ghost px-3 py-1.5 text-sm" onclick={() => unarchive(h)}>Restaurer</button>
				<button class="btn-ghost px-3 py-1.5 text-sm text-danger" onclick={() => destroy(h)}>Suppr.</button>
			</div>
		{/each}
	{/if}
</main>
