<script lang="ts">
	let {
		icon = '✨',
		title,
		body,
		actionLabel,
		onaction
	}: {
		icon?: string;
		title: string;
		body?: string;
		actionLabel?: string;
		onaction?: () => void;
	} = $props();
</script>

<div class="card flex flex-col items-center gap-3 py-10 text-center">
	<div class="text-4xl">{icon}</div>
	<div>
		<div class="font-semibold">{title}</div>
		{#if body}<p class="mt-1 text-sm text-muted">{body}</p>{/if}
	</div>
	{#if actionLabel && onaction}
		<button class="btn-primary" onclick={onaction}>{actionLabel}</button>
	{/if}
</div>
