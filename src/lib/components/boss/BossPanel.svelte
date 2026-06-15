<script lang="ts">
	import type { BossState, BossTier } from '$lib/server/boss';
	import BossHpBar from './BossHpBar.svelte';
	import StreakFlame from '$lib/components/game/StreakFlame.svelte';
	import MoneySaved from './MoneySaved.svelte';
	import TimeReclaimed from './TimeReclaimed.svelte';

	let {
		boss,
		onsos,
		onrelapse,
		onsetclean,
		ondefeat,
		oncheckin
	}: {
		boss: BossState;
		onsos: (id: number) => void;
		onrelapse: (boss: BossState) => void;
		onsetclean: (boss: BossState) => void;
		ondefeat: (boss: BossState) => void;
		oncheckin: (boss: BossState, minutesUsed: number | null, respectNoUseBefore: boolean | null) => Promise<{ success: boolean; coinsAwarded?: number }>;
	} = $props();

	const tierLabel: Record<BossTier, string> = {
		colossal: 'Colossal',
		affaibli: 'Affaibli',
		vacillant: 'Vacillant',
		agonisant: 'Agonisant',
		vaincu: 'Vaincu'
	};
	const tierEmojiClass: Record<BossTier, string> = {
		colossal: '',
		affaibli: 'opacity-90',
		vacillant: 'opacity-80 animate-wiggle',
		agonisant: 'opacity-60 grayscale-[.4] animate-wiggle',
		vaincu: 'opacity-40 grayscale'
	};

	const claimed = $derived(boss.defeatedAt !== null);
	const canClaimVictory = $derived(
		!claimed && boss.cleanSince !== null && boss.cleanDays >= boss.targetDays
	);
	const needsCheckin = $derived(boss.mode === 'limit' || boss.noUseBefore != null);

	// Check-in state
	let checkinOpen = $state(false);
	let minutesInput = $state<number>(0);
	let respectedNoBefore = $state<boolean>(true);
	let checkinBusy = $state(false);

	async function submitCheckin() {
		if (checkinBusy) return;
		checkinBusy = true;
		const mUsed = boss.mode === 'limit' ? minutesInput : null;
		const rNoBefore = boss.noUseBefore != null ? respectedNoBefore : null;

		// Évalue localement si la journée est réussie
		let isSuccess = true;
		if (boss.mode === 'limit' && boss.dailyLimitMinutes != null) {
			isSuccess = mUsed != null && mUsed <= boss.dailyLimitMinutes;
		}
		if (boss.noUseBefore != null) {
			isSuccess = isSuccess && (rNoBefore === true);
		}

		try {
			const r = await oncheckin(boss, mUsed, rNoBefore);
			checkinOpen = false;
			if (!r.success) {
				// Journée ratée → la page parente ouvre le RelapseFlow
				onrelapse(boss);
			}
		} finally {
			checkinBusy = false;
		}
	}
</script>

<div class="card flex flex-col gap-3 border-l-4 {boss.defeated ? 'border-l-health' : 'border-l-boss'}">
	<div class="flex items-center gap-3">
		<span class="text-4xl {tierEmojiClass[boss.tier]}">{boss.icon}</span>
		<div class="min-w-0 flex-1">
			<div class="truncate font-bold">{boss.name}</div>
			<div class="text-xs text-muted">Boss « {tierLabel[boss.tier]} »</div>
		</div>
	</div>

	{#if boss.cleanSince === null}
		<p class="text-sm text-muted">Indique depuis quand tu es clean pour commencer le combat.</p>
		<button class="btn-primary" onclick={() => onsetclean(boss)}>Définir une date de début</button>
	{:else}
		<BossHpBar hpRemaining={boss.hpRemaining} maxHp={boss.targetDays} tier={boss.tier} defeated={boss.defeated} />

		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
			<StreakFlame days={boss.cleanDays} showLabel />
			<span class="text-muted">🏆 Record : {boss.bestStreakDays} j</span>
		</div>

		{#if boss.trackMoney}
			<MoneySaved amount={boss.moneySaved} perDay={boss.moneyPerDay > 0 ? boss.moneyPerDay : undefined} />
		{/if}
		{#if boss.trackTime}
			<TimeReclaimed minutes={boss.timeReclaimed} baselinePerDay={boss.baselineMinutesPerDay} />
		{/if}

		{#if boss.nextMilestoneDays}
			<div class="text-xs text-muted">🩺 Prochain palier : {boss.nextMilestoneDays} jours clean</div>
		{/if}

		<!-- Check-in journalier (boss limit / no_use_before) -->
		{#if needsCheckin && !boss.defeated}
			{#if boss.todayCheckin}
				<div class="rounded-lg bg-health/10 px-3 py-2 text-sm font-medium text-health">
					✓ Journée réussie aujourd'hui
				</div>
			{:else if checkinOpen}
				<div class="flex flex-col gap-2 rounded-lg bg-surface2 p-3">
					<p class="text-sm font-semibold">Comment s'est passée ta journée ?</p>
					{#if boss.mode === 'limit' && boss.dailyLimitMinutes != null}
						<label class="label" for="bp-minutes">Temps passé (min) — limite : {boss.dailyLimitMinutes} min</label>
						<input id="bp-minutes" class="input" type="number" min="0" max="1440" bind:value={minutesInput} />
					{/if}
					{#if boss.noUseBefore}
						<p class="text-sm text-muted">As-tu réussi à ne pas y toucher avant {boss.noUseBefore} ?</p>
						<div class="flex gap-2">
							<button
								class="btn flex-1 {respectedNoBefore ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => (respectedNoBefore = true)}>Oui ✓</button>
							<button
								class="btn flex-1 {!respectedNoBefore ? 'bg-danger/15 text-danger' : 'btn-ghost'}"
								onclick={() => (respectedNoBefore = false)}>Non</button>
						</div>
					{/if}
					<div class="flex gap-2">
						<button class="btn-primary flex-1" onclick={submitCheckin} disabled={checkinBusy}>Valider</button>
						<button class="btn-ghost" onclick={() => (checkinOpen = false)}>Annuler</button>
					</div>
				</div>
			{:else}
				<button class="btn bg-accent/15 text-accent w-full" onclick={() => (checkinOpen = true)}>
					✦ J'ai tenu aujourd'hui
				</button>
			{/if}
		{/if}

		{#if claimed}
			<div class="rounded-lg bg-health/15 p-3 text-center text-sm font-semibold text-health">
				🏆 Boss vaincu — et la série continue !
			</div>
			<div class="flex gap-2">
				<button class="btn bg-boss/15 text-boss flex-1" onclick={() => onsos(boss.id)}>🆘 J'ai une envie</button>
				<button class="btn-ghost" onclick={() => onrelapse(boss)}>J'ai rechuté</button>
			</div>
		{:else if canClaimVictory}
			<div class="rounded-lg bg-health/15 p-3 text-center">
				<div class="font-bold text-health">🎉 Objectif atteint : {boss.targetDays} jours !</div>
				<button class="btn-primary mt-2 w-full" onclick={() => ondefeat(boss)}>Terrasser le boss</button>
			</div>
		{:else}
			<div class="flex gap-2">
				<button class="btn bg-boss/15 text-boss flex-1" onclick={() => onsos(boss.id)}>🆘 J'ai une envie</button>
				<button class="btn-ghost" onclick={() => onrelapse(boss)}>J'ai rechuté</button>
			</div>
		{/if}
	{/if}
</div>
