<script lang="ts">
	import type { Habit, HabitStatus } from '$lib/types';
	import { gameState } from '$lib/stores/gameState.svelte';
	import { postLog, deleteLog, ApiFailure } from '$lib/client/api';
	import { todayStr } from '$lib/client/clock';

	let { habit }: { habit: Habit } = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);
	let showMore = $state(false);

	const entry = $derived(gameState.today[habit.id]);
	const status = $derived<HabitStatus | null>(entry?.logStatus ?? null);
	const streak = $derived(entry?.streak ?? 0);
	const done = $derived(status === 'done');

	async function validate() {
		if (busy || done) return;
		busy = true;
		error = null;
		const prev = gameState.today[habit.id];
		const prevXp = gameState.user.total_xp;
		gameState.optimisticLog(habit);
		try {
			const { delta } = await postLog(habit.id, { date: todayStr(), status: 'done' });
			gameState.reconcile(delta, habit.id, 'done');
		} catch (e) {
			gameState.rollbackLog(habit.id, prev, prevXp);
			error = e instanceof ApiFailure ? e.message : 'Validation impossible. Réessaie.';
		} finally {
			busy = false;
		}
	}

	async function logStatus(s: HabitStatus) {
		if (busy) return;
		busy = true;
		error = null;
		showMore = false;
		try {
			const { delta } = await postLog(habit.id, { date: todayStr(), status: s });
			gameState.reconcile(delta, habit.id, s);
		} catch (e) {
			error = e instanceof ApiFailure ? e.message : 'Action impossible. Réessaie.';
		} finally {
			busy = false;
		}
	}

	async function undo() {
		if (busy) return;
		busy = true;
		error = null;
		showMore = false;
		try {
			const { delta } = await deleteLog(habit.id, todayStr());
			gameState.reconcile(delta, habit.id);
			// remet le statut à null (rien logué aujourd'hui)
			gameState.today[habit.id] = { habitId: habit.id, streak: delta.streakDays, logStatus: null };
		} catch (e) {
			error = e instanceof ApiFailure ? e.message : 'Annulation impossible.';
		} finally {
			busy = false;
		}
	}

	const statusLabel: Record<HabitStatus, string> = {
		done: 'Fait',
		skipped: 'Ignoré',
		relapsed: 'Rechute'
	};
</script>

<div class="card flex items-center gap-3 p-3" class:opacity-60={status === 'skipped'}>
	<div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl">
		{habit.icon ?? (habit.type === 'break' ? '🚫' : '✨')}
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="truncate font-semibold">{habit.name}</span>
			{#if streak > 0}
				<span class="inline-flex items-center gap-0.5 text-sm text-flame" title="Série en cours">
					🔥{streak}
				</span>
			{/if}
		</div>
		<div class="text-xs text-slate-400">
			{habit.type === 'break' ? 'À arrêter' : 'À construire'}
			{#if habit.category}· {habit.category}{/if}
			· difficulté {habit.difficulty}
			{#if status && status !== 'done'}· <span class="text-slate-300">{statusLabel[status]}</span>{/if}
		</div>
		{#if error}<div class="mt-1 text-xs text-danger">{error}</div>{/if}
	</div>

	{#if status}
		<button
			class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl transition active:scale-90"
			class:bg-health={done}
			class:text-slate-950={done}
			class:bg-surface-2={!done}
			onclick={undo}
			disabled={busy}
			aria-label="Annuler"
			title="Annuler"
		>
			{done ? '✓' : '↩'}
		</button>
	{:else}
		<div class="flex shrink-0 items-center gap-1">
			<button
				class="grid h-11 w-11 place-items-center rounded-full bg-primary text-xl font-bold text-slate-950 transition active:scale-90 disabled:opacity-50"
				onclick={validate}
				disabled={busy}
				aria-label="Valider {habit.name}"
			>
				✓
			</button>
			<button
				class="grid h-11 w-9 place-items-center rounded-full bg-surface-2 text-lg text-slate-400 active:scale-90"
				onclick={() => (showMore = !showMore)}
				aria-label="Autres actions"
			>
				⋯
			</button>
		</div>
	{/if}
</div>

{#if showMore && !status}
	<div class="-mt-1 flex justify-end gap-2 px-1 pb-1">
		<button class="btn-ghost px-3 py-1.5 text-sm" onclick={() => logStatus('skipped')} disabled={busy}>
			Ignorer aujourd'hui
		</button>
		{#if habit.type === 'break'}
			<button class="btn-ghost px-3 py-1.5 text-sm" onclick={() => logStatus('relapsed')} disabled={busy}>
				J'ai rechuté
			</button>
		{/if}
	</div>
{/if}
