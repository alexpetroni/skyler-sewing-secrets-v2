<script lang="ts">
	interface Props {
		value: number;
		max?: number;
		label?: string;
		size?: 'sm' | 'md' | 'lg';
		showPercentage?: boolean;
		class?: string;
	}

	let {
		value,
		max = 100,
		label,
		size = 'sm',
		showPercentage = false,
		class: className = ''
	}: Props = $props();

	const percentage = $derived(Math.min(Math.round((value / max) * 100), 100));

	const heightClasses = {
		sm: 'h-1',
		md: 'h-1.5',
		lg: 'h-2.5'
	};
</script>

<div class={className}>
	{#if label || showPercentage}
		<div class="mb-2 flex items-center justify-between gap-4">
			{#if label}
				<span class="text-[12px] text-charcoal-500">{label}</span>
			{/if}
			{#if showPercentage}
				<span class="text-[12px] font-medium tabular-nums text-charcoal-700">{percentage}%</span>
			{/if}
		</div>
	{/if}
	<div class="w-full overflow-hidden rounded-full bg-charcoal-900/[0.08] {heightClasses[size]}">
		<!-- scaleX rather than width: transform only, so the bar never triggers layout. -->
		<div
			class="w-full origin-left rounded-full bg-sage-500 transition-transform duration-1000 ease-fluid {heightClasses[size]}"
			style="transform: scaleX({percentage / 100})"
			role="progressbar"
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={max}
			aria-label={label ?? 'Progress'}
		></div>
	</div>
</div>
