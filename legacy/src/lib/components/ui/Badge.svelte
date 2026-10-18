<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' | 'brand'
		| 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'sage';
	type Size = 'sm' | 'md';

	interface Props {
		variant?: Variant;
		size?: Size;
		dot?: boolean;
		removable?: boolean;
		onremove?: () => void;
		children: Snippet;
	}

	let {
		variant = 'gray',
		size = 'md',
		dot = false,
		removable = false,
		onremove,
		children
	}: Props = $props();

	// Tinted glass rather than saturated fills — badges whisper, they don't flag.
	const variantClasses: Record<Variant, string> = {
		gray: 'bg-charcoal-900/[0.04] text-charcoal-600 ring-charcoal-900/[0.07]',
		secondary: 'bg-charcoal-900/[0.04] text-charcoal-600 ring-charcoal-900/[0.07]',
		red: 'bg-red-900/[0.06] text-red-800 ring-red-900/10',
		error: 'bg-red-900/[0.06] text-red-800 ring-red-900/10',
		yellow: 'bg-gold-400/15 text-gold-700 ring-gold-600/20',
		warning: 'bg-gold-400/15 text-gold-700 ring-gold-600/20',
		green: 'bg-sage-100/80 text-sage-700 ring-sage-700/15',
		success: 'bg-sage-100/80 text-sage-700 ring-sage-700/15',
		sage: 'bg-sage-100/80 text-sage-700 ring-sage-700/15',
		blue: 'bg-sage-100/70 text-sage-700 ring-sage-700/15',
		indigo: 'bg-charcoal-900/[0.05] text-charcoal-700 ring-charcoal-900/[0.08]',
		purple: 'bg-charcoal-900/[0.05] text-charcoal-700 ring-charcoal-900/[0.08]',
		pink: 'bg-brand-100/70 text-brand-800 ring-brand-700/15',
		brand: 'bg-brand-100/70 text-brand-800 ring-brand-700/15',
		primary: 'bg-brand-100/70 text-brand-800 ring-brand-700/15'
	};

	const dotClasses: Record<Variant, string> = {
		gray: 'fill-charcoal-400',
		secondary: 'fill-charcoal-400',
		red: 'fill-red-600',
		error: 'fill-red-600',
		yellow: 'fill-gold-500',
		warning: 'fill-gold-500',
		green: 'fill-sage-500',
		success: 'fill-sage-500',
		sage: 'fill-sage-500',
		blue: 'fill-sage-500',
		indigo: 'fill-charcoal-500',
		purple: 'fill-charcoal-500',
		pink: 'fill-brand-500',
		brand: 'fill-brand-500',
		primary: 'fill-brand-500'
	};

	const sizeClasses: Record<Size, string> = {
		sm: 'px-2.5 py-0.5 text-[11px]',
		md: 'px-3 py-1 text-[12px]'
	};
</script>

<span
	class="inline-flex items-center gap-x-1.5 rounded-full font-medium tracking-wide ring-1 ring-inset {variantClasses[
		variant
	]} {sizeClasses[size]}"
>
	{#if dot}
		<svg class="h-1.5 w-1.5 {dotClasses[variant]}" viewBox="0 0 6 6" aria-hidden="true">
			<circle cx="3" cy="3" r="3" />
		</svg>
	{/if}
	{@render children()}
	{#if removable}
		<button
			type="button"
			class="group relative -mr-1 h-3.5 w-3.5 rounded-full transition-colors duration-300 ease-fluid hover:bg-charcoal-900/10"
			onclick={onremove}
		>
			<span class="sr-only">Remove</span>
			<svg viewBox="0 0 14 14" class="h-3.5 w-3.5 stroke-current opacity-50 group-hover:opacity-90">
				<path d="M4 4l6 6m0-6l-6 6" stroke-linecap="round" />
			</svg>
		</button>
	{/if}
</span>
