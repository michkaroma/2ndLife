<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { enablePush, disablePush, getPushState, type PushState } from '$lib/client/push';
	import { celebration } from '$lib/stores/celebration.svelte';
	import { gameState } from '$lib/stores/gameState.svelte';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let pushState = $state<PushState>('default');
	let pushBusy = $state(false);

	const unlocked = $derived(data.achievements.filter((a) => a.unlocked_at).length);

	// --- Fuseau horaire ---
	let tz = $state(data.timezone ?? 'Europe/Paris');
	let tzBusy = $state(false);
	$effect(() => {
		// Pré-remplit avec le fuseau détecté par le navigateur (au montage).
		try {
			const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (detected && !data.timezone) tz = detected;
		} catch {
			/* noop */
		}
	});
	async function saveTimezone() {
		if (tzBusy) return;
		tzBusy = true;
		try {
			const r = await fetch('/api/settings/timezone', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ timezone: tz.trim() })
			});
			if (r.ok) celebration.toast('Fuseau horaire mis à jour.', 'success');
			else celebration.toast('Fuseau horaire invalide.', 'warn');
		} finally {
			tzBusy = false;
		}
	}

	// --- Prestige ---
	const canPrestige = $derived(gameState.level.canPrestige);
	let prestigeOpen = $state(false);
	let prestigeBusy = $state(false);
	async function doPrestige() {
		if (prestigeBusy) return;
		prestigeBusy = true;
		try {
			const r = await fetch('/api/prestige', { method: 'POST' });
			prestigeOpen = false;
			if (r.ok) {
				await invalidateAll();
				celebration.toast('Prestige atteint ! ✨ +500 pièces', 'gold');
			} else {
				celebration.toast('Prestige indisponible pour le moment.', 'warn');
			}
		} finally {
			prestigeBusy = false;
		}
	}

	$effect(() => {
		getPushState().then((s) => (pushState = s));
	});

	const pushLabel = $derived(
		pushState === 'subscribed'
			? 'Activés ✓'
			: pushState === 'denied'
				? 'Refusés (navigateur)'
				: pushState === 'unsupported'
					? 'Non supporté'
					: pushState === 'unconfigured'
						? 'Clés VAPID manquantes'
						: 'Désactivés'
	);

	async function togglePush() {
		if (pushBusy) return;
		pushBusy = true;
		try {
			if (pushState === 'subscribed') {
				await disablePush();
				pushState = 'default';
				celebration.toast('Rappels désactivés.', 'info');
			} else {
				const s = await enablePush();
				pushState = s;
				if (s === 'subscribed') celebration.toast('Rappels quotidiens activés ! 🔔', 'success');
				else if (s === 'denied')
					celebration.toast('Notifications refusées dans le navigateur.', 'warn');
				else if (s === 'unconfigured')
					celebration.toast('Push non configuré (clés VAPID manquantes côté serveur).', 'warn');
				else if (s === 'unsupported')
					celebration.toast('Notifications non supportées sur cet appareil.', 'warn');
			}
		} finally {
			pushBusy = false;
		}
	}

	async function testPush() {
		const r = await fetch('/api/push/test', { method: 'POST' });
		const d = (await r.json().catch(() => null)) as { sent?: number } | null;
		celebration.toast(d?.sent ? `Notification envoyée (${d.sent}).` : 'Aucun appareil abonné.', 'info');
	}

	async function logout() {
		busy = true;
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}
</script>

<svelte:head><title>Réglages · HabitQuest</title></svelte:head>

<div class="flex flex-col gap-5">
	<h1 class="text-xl font-extrabold tracking-tight">Réglages</h1>

	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-bold">Rappels quotidiens</h2>
		<div class="card flex items-center justify-between gap-3">
			<div class="min-w-0">
				<div class="font-semibold">Notifications</div>
				<div class="text-xs text-muted">{pushLabel}</div>
			</div>
			<button class="btn-primary" onclick={togglePush} disabled={pushBusy}>
				{pushState === 'subscribed' ? 'Désactiver' : 'Activer'}
			</button>
		</div>
		{#if pushState === 'subscribed'}
			<button class="btn-ghost" onclick={testPush}>Envoyer une notification de test</button>
		{/if}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-bold">Fuseau horaire</h2>
		<div class="card flex flex-col gap-2">
			<div class="text-xs text-muted">Utilisé pour programmer tes rappels à la bonne heure.</div>
			<div class="flex items-center gap-2">
				<input
					class="input flex-1"
					type="text"
					bind:value={tz}
					placeholder="Europe/Paris"
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="btn-primary" onclick={saveTimezone} disabled={tzBusy}>Enregistrer</button>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-bold">Prestige</h2>
		{#if canPrestige}
			<div class="card flex items-center justify-between gap-3">
				<div class="min-w-0 text-sm text-muted">
					Repars à zéro en gardant toute ta progression, et gagne 500 pièces.
				</div>
				<button class="btn-primary shrink-0" onclick={() => (prestigeOpen = true)}>
					Entrer en prestige ✨
				</button>
			</div>
		{:else}
			<div class="card text-sm text-muted opacity-60">Prestige débloqué au niveau 50.</div>
		{/if}
	</section>

	<section class="flex flex-col gap-2">
		<div class="flex items-baseline justify-between">
			<h2 class="text-lg font-bold">Succès</h2>
			<span class="text-sm text-muted tabular-nums">{unlocked}/{data.achievements.length}</span>
		</div>
		<div class="grid grid-cols-2 gap-2">
			{#each data.achievements as a (a.key)}
				<div class="card flex items-center gap-2 p-3" class:opacity-45={!a.unlocked_at}>
					<span class="text-2xl">{a.unlocked_at ? (a.icon ?? '🏆') : '🔒'}</span>
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold">{a.name}</div>
						<div class="truncate text-xs text-muted">{a.description}</div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<button class="btn-danger" onclick={logout} disabled={busy}>Se déconnecter</button>
</div>

<ConfirmDialog
	open={prestigeOpen}
	title="Entrer en prestige ?"
	body="Ton niveau repart à 1, mais tu gardes tes pièces, tes cosmétiques et toute ta progression. Tu gagnes une étoile de prestige, une auréole, et 500 pièces. Un nouveau cycle commence."
	confirmLabel="Renaître ✨"
	cancelLabel="Pas encore"
	onconfirm={doPrestige}
	oncancel={() => (prestigeOpen = false)}
/>
