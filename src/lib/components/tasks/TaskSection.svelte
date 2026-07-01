<script lang="ts">
	import type { OneTimeTask, NewOneTimeTask } from '$lib/types';
	import TaskForm from './TaskForm.svelte';
	import TaskRow from './TaskRow.svelte';
	import { apiFetch, ApiFailure, completeTask, reopenTask } from '$lib/client/api';
	import { gameState } from '$lib/stores/gameState.svelte';
	import { celebration, celebrateFromDelta } from '$lib/stores/celebration.svelte';
	import { invalidateAll } from '$app/navigation';

	let { tasks, doneTasks }: { tasks: OneTimeTask[]; doneTasks: OneTimeTask[] } = $props();

	let creating = $state(false);
	let editing = $state<OneTimeTask | null>(null);
	let submitting = $state(false);
	let busyId = $state<number | null>(null);
	let showDone = $state(false);

	async function create(values: NewOneTimeTask) {
		submitting = true;
		try {
			await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(values) });
			creating = false;
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Création impossible.', 'danger');
		} finally {
			submitting = false;
		}
	}

	async function update(values: NewOneTimeTask) {
		if (!editing) return;
		submitting = true;
		try {
			await apiFetch(`/api/tasks/${editing.id}`, { method: 'PUT', body: JSON.stringify(values) });
			editing = null;
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Modification impossible.', 'danger');
		} finally {
			submitting = false;
		}
	}

	async function remove(t: OneTimeTask) {
		if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return;
		try {
			await apiFetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Suppression impossible.', 'danger');
		}
	}

	async function complete(t: OneTimeTask) {
		busyId = t.id;
		try {
			const { delta } = await completeTask(t.id);
			gameState.reconcile(delta);
			celebrateFromDelta(delta);
			celebration.toast(`Tâche terminée ! +${delta.xpGained} XP ✨`, 'success');
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Action impossible.', 'danger');
		} finally {
			busyId = null;
		}
	}

	async function reopen(t: OneTimeTask) {
		busyId = t.id;
		try {
			const { delta } = await reopenTask(t.id);
			gameState.reconcile(delta);
			await invalidateAll();
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Action impossible.', 'danger');
		} finally {
			busyId = null;
		}
	}
</script>

<section class="flex flex-col gap-2">
	<div class="flex items-baseline justify-between">
		<h2 class="text-lg font-extrabold tracking-tight">Tâches ponctuelles</h2>
		<button
			class="text-sm font-semibold text-primary"
			onclick={() => {
				creating = !creating;
				editing = null;
			}}
		>
			{creating ? 'Fermer' : '+ Nouvelle'}
		</button>
	</div>

	{#if creating}
		<div class="card"><TaskForm onsubmit={create} oncancel={() => (creating = false)} {submitting} /></div>
	{/if}

	{#each tasks as t (t.id)}
		{#if editing?.id === t.id}
			<div class="card">
				<TaskForm task={t} onsubmit={update} oncancel={() => (editing = null)} {submitting} />
			</div>
		{:else}
			<TaskRow
				task={t}
				busy={busyId === t.id}
				oncomplete={complete}
				onedit={(x) => {
					editing = x;
					creating = false;
				}}
				ondelete={remove}
			/>
		{/if}
	{/each}

	{#if tasks.length === 0 && !creating}
		<div class="card flex flex-col items-center gap-2 py-6 text-center text-muted">
			<div class="text-3xl">📌</div>
			<p class="text-sm">Aucune tâche en cours. Ajoute une action à faire une seule fois.</p>
		</div>
	{/if}

	{#if doneTasks.length > 0}
		<button
			class="mt-1 self-start text-sm text-muted hover:text-ink"
			onclick={() => (showDone = !showDone)}
		>
			{showDone ? 'Masquer' : 'Voir'} les tâches terminées ({doneTasks.length})
		</button>
		{#if showDone}
			{#each doneTasks as t (t.id)}
				<TaskRow task={t} done busy={busyId === t.id} onreopen={reopen} ondelete={remove} />
			{/each}
		{/if}
	{/if}
</section>
