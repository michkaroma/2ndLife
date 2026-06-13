<script lang="ts">
	let {
		options,
		value,
		onchange,
		ariaLabel
	}: {
		options: { value: string; label: string }[];
		value: string;
		onchange: (v: string) => void;
		ariaLabel?: string;
	} = $props();
</script>

<div class="grid gap-1 rounded-pill bg-surface2 p-1" style="grid-template-columns: repeat({options.length}, 1fr);" role="tablist" aria-label={ariaLabel}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === o.value}
			class="rounded-pill px-3 py-1.5 text-sm font-medium transition"
			class:bg-primary={value === o.value}
			class:text-white={value === o.value}
			class:text-muted={value !== o.value}
			onclick={() => onchange(o.value)}
		>
			{o.label}
		</button>
	{/each}
</div>
