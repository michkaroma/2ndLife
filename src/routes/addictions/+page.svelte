<script lang="ts">
	import type { PageData } from './$types';
	import type { BossState } from '$lib/server/boss';
	import type { Achievement } from '$lib/types';
	import BossPanel from '$lib/components/boss/BossPanel.svelte';
	import RelapseFlow from '$lib/components/boss/RelapseFlow.svelte';
	import HealthTimeline from '$lib/components/boss/HealthTimeline.svelte';
	import TriggerJournalForm, { type TriggerInput } from '$lib/components/boss/TriggerJournalForm.svelte';
	import TriggerTrends from '$lib/components/boss/TriggerTrends.svelte';
	import { apiFetch, ApiFailure } from '$lib/client/api';
	import { sos } from '$lib/stores/sos.svelte';
	import { celebration } from '$lib/stores/celebration.svelte';
	import { ADDICTION_KINDS } from '$lib/content/fr';
	import { todayStr } from '$lib/client/clock';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Création
	let creating = $state(false);
	let nName = $state('');
	let nKind = $state('reseaux');  // comportemental par défaut
	let nTarget = $state(90);
	let nClean = $state(todayStr());
	// Champs comportementaux
	let nMode = $state<'abstinence' | 'limit'>('abstinence');
	let nLimit = $state(30);
	let nNoUseBeforeEnabled = $state(false);
	let nNoUseBefore = $state('09:00');
	let nBaseline = $state(90);
	// Champs substances
	let nMoney = $state(0);

	const selectedKind = $derived(ADDICTION_KINDS.find((k) => k.value === nKind));
	const isBehavioral = $derived(selectedKind?.behavioral === true);

	// Rechute
	let relapseBoss = $state<BossState | null>(null);

	// Date de début
	let cleanBoss = $state<BossState | null>(null);
	let cleanDate = $state(todayStr());

	// Journal
	let journalOpen = $state(false);

	const expandedBoss = $derived(data.bosses.find((b) => b.cleanSince) ?? data.bosses[0] ?? null);

	async function createBoss(e: Event) {
		e.preventDefault();
		if (!nName.trim()) return;
		try {
			await apiFetch('/api/addictions', {
				method: 'POST',
				body: JSON.stringify({
					name: nName.trim(),
					kind: nKind,
					target_streak_days: nTarget,
					clean_since: nClean || null,
					...(isBehavioral
						? {
								mode: nMode,
								daily_limit_minutes: nMode === 'limit' ? nLimit : null,
								no_use_before: nNoUseBeforeEnabled ? nNoUseBefore : null,
								baseline_minutes_per_day: nBaseline,
								track_time: true,
								track_money: false
							}
						: {
								mode: 'abstinence',
								money_per_day: nMoney,
								track_money: true,
								track_time: false
							})
				})
			});
			creating = false;
			nName = '';
			nKind = 'reseaux';
			nMoney = 0;
			nTarget = 90;
			nMode = 'abstinence';
			nLimit = 30;
			nNoUseBeforeEnabled = false;
			nBaseline = 90;
			await invalidateAll();
		} catch (err) {
			celebration.toast(err instanceof ApiFailure ? err.message : 'Création impossible.', 'danger');
		}
	}

	function onsetclean(boss: BossState) {
		cleanBoss = boss;
		cleanDate = boss.cleanSince ?? todayStr();
	}
	async function confirmClean() {
		if (!cleanBoss) return;
		const id = cleanBoss.id;
		cleanBoss = null;
		await apiFetch(`/api/addictions/${id}/clean-date`, {
			method: 'POST',
			body: JSON.stringify({ cleanSince: cleanDate })
		});
		await invalidateAll();
	}

	async function ondefeat(boss: BossState) {
		try {
			const r = await apiFetch<{ coinsAwarded: number; unlockedAchievements: Achievement[] }>(
				`/api/addictions/${boss.id}/defeat`,
				{ method: 'POST' }
			);
			celebration.toast(`Boss vaincu ! 🏆 +${r.coinsAwarded} pièces`, 'gold');
			for (const a of r.unlockedAchievements) celebration.pushAchievement(a);
			await invalidateAll();
		} catch (err) {
			celebration.toast(err instanceof ApiFailure ? err.message : 'Action impossible.', 'danger');
		}
	}

	async function oncheckin(
		boss: BossState,
		minutesUsed: number | null,
		respectNoUseBefore: boolean | null
	): Promise<{ success: boolean; coinsAwarded?: number }> {
		try {
			const r = await apiFetch<{ success: boolean; coinsAwarded: number }>(
				`/api/addictions/${boss.id}/checkin`,
				{
					method: 'POST',
					body: JSON.stringify({ minutesUsed, respectNoUseBefore })
				}
			);
			if (r.success) {
				celebration.toast(`Journée réussie ! +${r.coinsAwarded} pièces 🎉`, 'success');
				await invalidateAll();
			}
			return r;
		} catch (err) {
			celebration.toast(err instanceof ApiFailure ? err.message : 'Action impossible.', 'danger');
			return { success: false };
		}
	}

	async function relapseConfirm(p: {
		useFreeze: boolean;
		trigger: string | null;
		craving: number | null;
		note: string | null;
	}) {
		const id = relapseBoss!.id;
		const r = await apiFetch<{ usedFreeze: boolean; bestStreakDays: number }>(
			`/api/addictions/${id}/relapse`,
			{ method: 'POST', body: JSON.stringify(p) }
		);
		await invalidateAll();
		return { usedFreeze: r.usedFreeze, bestStreakDays: r.bestStreakDays };
	}

	async function addTrigger(t: TriggerInput) {
		try {
			const r = await apiFetch<{ unlockedAchievements: Achievement[] }>('/api/triggers', {
				method: 'POST',
				body: JSON.stringify({
					targetId: t.targetId,
					trigger: t.trigger,
					craving: t.craving,
					note: t.note,
					gaveIn: t.gaveIn
				})
			});
			for (const a of r.unlockedAchievements) celebration.pushAchievement(a);
			journalOpen = false;
			celebration.toast("Noté. C'est déjà une victoire. 💙", 'success');
			await invalidateAll();
		} catch (err) {
			celebration.toast(err instanceof ApiFailure ? err.message : 'Enregistrement impossible.', 'danger');
		}
	}
</script>

<svelte:head><title>Boss · HabitQuest</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-extrabold tracking-tight">Tes boss</h1>
		<button class="text-sm font-semibold text-primary" onclick={() => (creating = !creating)}>
			{creating ? 'Fermer' : '+ Nouveau'}
		</button>
	</div>

	{#if creating}
		<form class="card flex flex-col gap-3" onsubmit={createBoss}>
			<input
				class="input"
				bind:value={nName}
				placeholder={isBehavioral ? 'ex : Instagram' : 'ex : Cigarette'}
				maxlength="60"
				required
			/>

			<div>
				<label class="label" for="nk">Type</label>
				<select id="nk" class="input" bind:value={nKind}>
					{#each ADDICTION_KINDS as k (k.value)}<option value={k.value}>{k.icon} {k.label}</option>{/each}
				</select>
			</div>

			{#if isBehavioral}
				<!-- Champs comportementaux -->
				<div>
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="label">Mode</label>
					<div class="flex gap-2" role="group" aria-label="Mode de suivi">
						<button type="button"
							class="btn flex-1 {nMode === 'abstinence' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => (nMode = 'abstinence')}>Abstinence</button>
						<button type="button"
							class="btn flex-1 {nMode === 'limit' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => (nMode = 'limit')}>Limiter l'usage</button>
					</div>
				</div>

				{#if nMode === 'limit'}
					<div>
						<label class="label" for="nlimit">Limite quotidienne (min)</label>
						<input id="nlimit" class="input" type="number" min="1" max="1440" bind:value={nLimit} />
					</div>
				{/if}

				<div class="flex items-center gap-2">
					<input id="nnob" type="checkbox" bind:checked={nNoUseBeforeEnabled} />
					<label for="nnob" class="text-sm">Règle « pas avant … »</label>
				</div>
				{#if nNoUseBeforeEnabled}
					<input class="input" type="time" bind:value={nNoUseBefore} />
				{/if}

				<div>
					<label class="label" for="nbl">Minutes/jour avant (baseline)</label>
					<input id="nbl" class="input" type="number" min="0" max="1440" bind:value={nBaseline} />
				</div>
			{:else}
				<!-- Champs substance -->
				<div>
					<label class="label" for="nm">€ / jour économisés</label>
					<input id="nm" class="input" type="number" min="0" step="0.5" bind:value={nMoney} />
				</div>
			{/if}

			<div>
				<label class="label" for="nt">Objectif (jours)</label>
				<input id="nt" class="input" type="number" min="7" max="365" bind:value={nTarget} />
			</div>
			<div>
				<label class="label" for="ncl">Clean depuis</label>
				<input id="ncl" class="input" type="date" max={todayStr()} bind:value={nClean} />
			</div>
			<button type="submit" class="btn-primary">Créer le boss</button>
		</form>
	{/if}

	{#if data.bosses.length === 0 && !creating}
		<div class="card flex flex-col items-center gap-3 py-10 text-center">
			<div class="text-4xl">🛡️</div>
			<p class="text-muted">Aucun boss pour l'instant. Définis un défi à vaincre.</p>
			<button class="btn-primary" onclick={() => (creating = true)}>Ajouter un boss</button>
		</div>
	{:else}
		{#each data.bosses as boss (boss.id)}
			<BossPanel
				{boss}
				onsos={(id) => sos.openSos(id)}
				onrelapse={(b) => (relapseBoss = b)}
				{onsetclean}
				{ondefeat}
				{oncheckin}
			/>
		{/each}
	{/if}

	{#if expandedBoss && expandedBoss.cleanSince}
		<HealthTimeline kind={expandedBoss.kind} cleanSince={expandedBoss.cleanSince} />
	{/if}

	<section class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-bold">Journal de déclencheurs</h2>
			<button class="text-sm font-semibold text-primary" onclick={() => (journalOpen = !journalOpen)}>
				{journalOpen ? 'Fermer' : '+ Noter'}
			</button>
		</div>
		{#if journalOpen}
			<div class="card">
				<TriggerJournalForm
					targetId={expandedBoss?.id ?? null}
					onsubmit={addTrigger}
					oncancel={() => (journalOpen = false)}
				/>
			</div>
		{/if}
		<TriggerTrends stats={data.stats} />
	</section>
</div>

<RelapseFlow
	open={relapseBoss !== null}
	boss={relapseBoss}
	freezes={data.freezes}
	onconfirm={relapseConfirm}
	onclose={() => (relapseBoss = null)}
/>

{#if cleanBoss}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
		role="presentation"
		onclick={() => (cleanBoss = null)}
	>
		<div
			class="card w-full max-w-sm"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="text-lg font-bold">Depuis quand es-tu clean ?</h2>
			<p class="mt-1 text-sm text-muted">On comptera tes jours clean à partir de cette date.</p>
			<input class="input mt-3" type="date" max={todayStr()} bind:value={cleanDate} />
			<div class="mt-4 flex gap-2">
				<button class="btn-primary flex-1" onclick={confirmClean}>Valider</button>
				<button class="btn-ghost" onclick={() => (cleanBoss = null)}>Annuler</button>
			</div>
		</div>
	</div>
{/if}
