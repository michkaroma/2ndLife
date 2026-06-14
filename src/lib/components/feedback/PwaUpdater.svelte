<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	const { needRefresh, updateServiceWorker } = useRegisterSW({
		onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
			if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
		}
	});
</script>

{#if $needRefresh}
	<div
		class="fixed inset-x-0 z-50 mx-auto flex max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-raised"
		style="bottom: calc(var(--nav-h) + var(--safe-bottom) + 0.75rem); left: 0.75rem; right: 0.75rem;"
		role="status"
	>
		<span class="flex-1">Une nouvelle version est disponible.</span>
		<button class="btn-primary px-3 py-1.5 text-xs" onclick={() => updateServiceWorker(true)}>
			Mettre à jour
		</button>
		<button class="text-xs text-muted" onclick={() => ($needRefresh = false)}>Plus tard</button>
	</div>
{/if}
