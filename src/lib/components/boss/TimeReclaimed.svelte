<script lang="ts">
	import { TIME_EQUIVALENTS, formatMinutes } from '$lib/config/timeEquivalents';
	import { reducedMotion } from '$lib/motion';

	interface Props {
		minutes: number;          // total de minutes reprises
		baselinePerDay: number;   // baseline pour afficher "X min/jour"
	}

	let { minutes, baselinePerDay }: Props = $props();

	let display = $state(0);

	const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

	const formatted = $derived(formatMinutes(Math.round(display)));

	const equivalent = $derived.by(() => {
		let match: { seuilMinutes: number; label: string } | undefined;
		for (const eq of TIME_EQUIVALENTS) {
			if (eq.seuilMinutes <= minutes) match = eq;
		}
		return match;
	});

	$effect(() => {
		const target = minutes;
		if (reducedMotion()) {
			display = target;
			return;
		}
		const from = display;
		const delta = target - from;
		const duration = 900;
		const start = performance.now();
		let raf = 0;

		const tick = (now: number) => {
			const elapsed = now - start;
			const t = Math.min(elapsed / duration, 1);
			display = from + delta * easeOutCubic(t);
			if (t < 1) {
				raf = requestAnimationFrame(tick);
			} else {
				display = target;
			}
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="card flex flex-col items-center text-center">
	<h3 class="label text-muted">Temps repris ⏱️</h3>

	<p class="font-display text-health text-4xl sm:text-5xl tabular-nums" aria-live="polite">
		~{formatted}
	</p>

	{#if baselinePerDay > 0}
		<p class="text-muted text-sm">{baselinePerDay} min/jour avant</p>
	{/if}

	{#if equivalent}
		<p class="text-sm">Soit déjà {equivalent.label} !</p>
	{/if}
</div>
