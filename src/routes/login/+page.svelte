<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let password = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		busy = true;
		error = null;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				error = data?.error?.message ?? 'Connexion impossible.';
				return;
			}
			const to = $page.url.searchParams.get('redirectTo') ?? '/';
			await goto(to);
		} catch {
			error = 'Connexion impossible. Réessaie.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Connexion · HabitQuest</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6">
	<div class="flex flex-col items-center gap-2 text-center">
		<div class="text-5xl">🎮</div>
		<h1 class="text-2xl font-extrabold tracking-tight">HabitQuest</h1>
		<p class="text-sm text-slate-400">Entre ton mot de passe pour continuer.</p>
	</div>

	<form class="flex w-full flex-col gap-3" onsubmit={submit}>
		<input
			type="password"
			class="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center outline-none focus:border-primary"
			bind:value={password}
			placeholder="Mot de passe"
			autocomplete="current-password"
			required
		/>
		{#if error}<div class="text-center text-sm text-danger">{error}</div>{/if}
		<button type="submit" class="btn-primary w-full" disabled={busy || !password}>
			{busy ? 'Connexion…' : 'Se connecter'}
		</button>
	</form>
</main>
