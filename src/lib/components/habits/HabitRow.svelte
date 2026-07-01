<script lang="ts">
	import type { Habit, HabitStatus } from '$lib/types';
	import { gameState } from '$lib/stores/gameState.svelte';
	import { celebration, celebrateFromDelta } from '$lib/stores/celebration.svelte';
	import { postLog, deleteLog, ApiFailure } from '$lib/client/api';
	import { todayStr } from '$lib/client/clock';
	import StreakFlame from '$lib/components/game/StreakFlame.svelte';

	let { habit }: { habit: Habit } = $props();

	let busy = $state(false);
	let showMore = $state(false);

	const entry = $derived(gameState.today[habit.id]);
	const status = $derived<HabitStatus | null>(entry?.logStatus ?? null);
	const streak = $derived(entry?.streak ?? 0);
	const done = $derived(status === 'done');

	const isWeekly = $derived(habit.frequency_type === 'weekly');
	const weekly = $derived(entry?.weekly ?? null);
	const weeklyCount = $derived(weekly?.count ?? 0);
	const weeklyQuota = $derived(weekly?.quota ?? Math.max(1, habit.weekly_quota));
	const weeklyMet = $derived(weekly?.met ?? false);
	const weeklyPct = $derived(Math.min(100, Math.round((weeklyCount / weeklyQuota) * 100)));

	const statusLabel: Record<HabitStatus, string> = {
		done: 'Fait',
		skipped: 'Ignoré',
		relapsed: 'Rechute'
	};

	async function validate() {
		if (busy || done) return;
		busy = true;
		const prev = gameState.today[habit.id];
		const prevXp = gameState.user.total_xp;
		gameState.optimisticLog(habit);
		try {
			const r = await postLog(habit.id, { date: todayStr(), status: 'done' });
			if ('queued' in r) {
				celebration.toast('Validé hors-ligne. Synchro à la reconnexion. ⏳', 'info');
			} else {
				gameState.reconcile(r.delta, habit.id, 'done');
				if (r.quests) gameState.setQuests(r.quests);
				celebrateFromDelta(r.delta);
				if (r.delta.weeklyQuotaJustMet)
					celebration.toast('Objectif hebdo atteint ! 🎯', 'gold');
			}
		} catch (e) {
			gameState.rollbackLog(habit.id, prev, prevXp);
			celebration.toast(
				e instanceof ApiFailure ? e.message : 'Validation impossible.',
				'danger',
				{ action: { label: 'Réessayer', run: validate } }
			);
		} finally {
			busy = false;
		}
	}

	async function logStatus(s: HabitStatus) {
		if (busy) return;
		busy = true;
		showMore = false;
		try {
			const r = await postLog(habit.id, { date: todayStr(), status: s });
			if ('queued' in r) {
				gameState.today[habit.id] = {
					habitId: habit.id,
					streak: gameState.today[habit.id]?.streak ?? 0,
					logStatus: s,
					weekly: gameState.today[habit.id]?.weekly ?? null
				};
				celebration.toast('Enregistré hors-ligne. ⏳', 'info');
			} else {
				gameState.reconcile(r.delta, habit.id, s);
				if (r.quests) gameState.setQuests(r.quests);
				if (s === 'relapsed')
					celebration.toast('On note, on repart. Demain est un nouveau jour. 💪', 'info');
			}
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Action impossible.', 'danger');
		} finally {
			busy = false;
		}
	}

	async function undo() {
		if (busy) return;
		busy = true;
		showMore = false;
		try {
			const { delta, quests } = await deleteLog(habit.id, todayStr());
			gameState.reconcile(delta, habit.id);
			if (quests) gameState.setQuests(quests);
			gameState.today[habit.id] = {
				habitId: habit.id,
				streak: delta.streakDays,
				logStatus: null,
				weekly: delta.weekly ?? null
			};
		} catch (e) {
			celebration.toast(e instanceof ApiFailure ? e.message : 'Annulation impossible.', 'danger');
		} finally {
			busy = false;
		}
	}
</script>

<div class="card flex items-center gap-3 p-3" class:opacity-60={status === 'skipped'}>
	<div class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface2 text-2xl">
		{habit.icon ?? (habit.type === 'break' ? '🚫' : '✨')}
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span class="truncate font-semibold">{habit.name}</span>
			{#if isWeekly}
				{#if weekly && weekly.streak > 0}
					<span class="pill shrink-0 bg-flame/15 text-flame" title="Semaines consécutives réussies">
						🔥 {weekly.streak} sem.
					</span>
				{/if}
			{:else if streak > 0}
				<StreakFlame days={streak} size="sm" />
			{/if}
		</div>
		<div class="text-xs text-muted">
			{#if isWeekly}
				Hebdo · <span class="text-ink">{weeklyCount}/{weeklyQuota}</span> cette semaine
				{#if weeklyMet}· <span class="text-health">rempli ✓</span>{/if}
				· diff. {habit.difficulty}
			{:else}
				{habit.type === 'break' ? 'À arrêter' : 'À construire'}
				{#if habit.category}· {habit.category}{/if}
				· diff. {habit.difficulty}
				{#if status && status !== 'done'}· <span class="text-ink">{statusLabel[status]}</span>{/if}
			{/if}
		</div>
		{#if isWeekly}
			<div class="track mt-1.5">
				<div
					class="track-fill {weeklyMet ? 'bg-health' : 'bg-primary'}"
					style="width:{weeklyPct}%"
				></div>
			</div>
		{/if}
	</div>

	{#if status}
		<button
			class="grid h-11 w-11 shrink-0 place-items-center rounded-pill text-xl transition active:scale-90"
			class:bg-health={done}
			class:text-white={done}
			class:bg-surface2={!done}
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
				class="relative grid h-11 w-11 place-items-center rounded-pill bg-primary text-xl font-bold text-white transition active:scale-90 disabled:opacity-50"
				onclick={validate}
				disabled={busy}
				aria-label="Valider {habit.name}"
			>
				✓
			</button>
			<button
				class="grid h-11 w-8 place-items-center rounded-pill bg-surface2 text-lg text-muted active:scale-90"
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
