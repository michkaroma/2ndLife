<script lang="ts">
	import type { OneTimeTask } from '$lib/types';

	let {
		task,
		done = false,
		busy = false,
		oncomplete,
		onreopen,
		onedit,
		ondelete
	}: {
		task: OneTimeTask;
		done?: boolean;
		busy?: boolean;
		oncomplete?: (t: OneTimeTask) => void;
		onreopen?: (t: OneTimeTask) => void;
		onedit?: (t: OneTimeTask) => void;
		ondelete?: (t: OneTimeTask) => void;
	} = $props();

	const DIFF_LABELS = ['Rapide', 'Moyenne', 'Ambitieuse'];

	function formatDate(d: string): string {
		const [y, m, day] = d.split('-').map(Number);
		return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
	}
</script>

<div class="card flex items-start gap-3 p-3" class:opacity-70={done}>
	{#if done}
		<span class="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-health/20 text-health">✓</span>
	{:else}
		<button
			class="grid h-9 w-9 shrink-0 place-items-center rounded-pill border-2 border-border text-lg text-muted transition hover:border-health hover:text-health active:scale-90 disabled:opacity-50"
			onclick={() => oncomplete?.(task)}
			disabled={busy}
			aria-label="Marquer « {task.title} » comme faite"
			title="Marquer comme faite"
		>
			○
		</button>
	{/if}

	<div class="min-w-0 flex-1">
		<div class="font-semibold leading-tight" class:line-through={done} class:text-muted={done}>
			{task.title}
		</div>
		<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
			<span>{DIFF_LABELS[task.difficulty - 1]}</span>
			{#if !done && task.due_date}<span>· 📅 {formatDate(task.due_date)}</span>{/if}
			{#if done}<span>· terminée</span>{/if}
		</div>
		{#if task.note}<div class="mt-1 text-xs text-muted">{task.note}</div>{/if}
	</div>

	<div class="flex shrink-0 items-center gap-1">
		{#if done}
			<button
				class="btn-ghost px-2 py-1 text-sm"
				onclick={() => onreopen?.(task)}
				disabled={busy}
				title="Remettre à faire"
				aria-label="Remettre « {task.title} » à faire"
			>↩</button>
		{:else}
			<button
				class="btn-ghost px-2 py-1 text-sm"
				onclick={() => onedit?.(task)}
				title="Modifier"
				aria-label="Modifier « {task.title} »"
			>✎</button>
		{/if}
		<button
			class="btn-ghost px-2 py-1 text-sm hover:text-danger"
			onclick={() => ondelete?.(task)}
			title="Supprimer"
			aria-label="Supprimer « {task.title} »"
		>🗑</button>
	</div>
</div>
