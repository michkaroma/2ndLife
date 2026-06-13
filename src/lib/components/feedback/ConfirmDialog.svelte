<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { dur } from '$lib/motion';

	let {
		open,
		title,
		body,
		confirmLabel = 'Confirmer',
		cancelLabel = 'Annuler',
		tone = 'default',
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		body?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		tone?: 'default' | 'danger';
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
		transition:fade={{ duration: dur(180) }}
		onclick={oncancel}
		onkeydown={(e) => e.key === 'Escape' && oncancel()}
		role="presentation"
	>
		<div
			class="card w-full max-w-sm"
			transition:scale={{ start: 0.96, duration: dur(200) }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h2 class="text-lg font-bold">{title}</h2>
			{#if body}<p class="mt-1 text-sm text-muted">{body}</p>{/if}
			<div class="mt-4 flex gap-2">
				<button
					class={tone === 'danger' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
					onclick={onconfirm}
				>
					{confirmLabel}
				</button>
				<button class="btn-ghost" onclick={oncancel}>{cancelLabel}</button>
			</div>
		</div>
	</div>
{/if}
