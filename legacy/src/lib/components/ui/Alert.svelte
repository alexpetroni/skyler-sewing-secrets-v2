<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'info' | 'success' | 'warning' | 'error';

	interface Props {
		variant?: Variant;
		title?: string;
		dismissible?: boolean;
		ondismiss?: () => void;
		children: Snippet;
	}

	let { variant = 'info', title, dismissible = false, ondismiss, children }: Props = $props();

	let visible = $state(true);

	// Tinted plates with a single accent hairline down the leading edge.
	const variantStyles: Record<Variant, { plate: string; accent: string; icon: string; title: string; text: string }> = {
		info: {
			plate: 'bg-sage-50 ring-sage-700/10',
			accent: 'bg-sage-400',
			icon: 'text-sage-600',
			title: 'text-sage-900',
			text: 'text-sage-800/85'
		},
		success: {
			plate: 'bg-sage-50 ring-sage-700/10',
			accent: 'bg-sage-500',
			icon: 'text-sage-600',
			title: 'text-sage-900',
			text: 'text-sage-800/85'
		},
		warning: {
			plate: 'bg-brand-50 ring-brand-700/10',
			accent: 'bg-gold-400',
			icon: 'text-gold-600',
			title: 'text-brand-900',
			text: 'text-brand-900/80'
		},
		error: {
			plate: 'bg-red-50/70 ring-red-900/10',
			accent: 'bg-red-500',
			icon: 'text-red-600',
			title: 'text-red-900',
			text: 'text-red-900/80'
		}
	};

	const style = $derived(variantStyles[variant]);

	function handleDismiss() {
		visible = false;
		ondismiss?.();
	}
</script>

{#if visible}
	<div class="relative overflow-hidden rounded-2xl px-5 py-4 ring-1 ring-inset {style.plate}">
		<span class="absolute inset-y-0 left-0 w-[3px] {style.accent}" aria-hidden="true"></span>
		<div class="flex gap-3.5">
			<span class="mt-0.5 flex-shrink-0 {style.icon}" aria-hidden="true">
				{#if variant === 'success'}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="10" cy="10" r="7.5" />
						<path d="m6.75 10.25 2.25 2.25 4.25-5" />
					</svg>
				{:else if variant === 'warning'}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 2.75 18 16.5H2L10 2.75Z" />
						<path d="M10 8v3.25M10 13.75h.01" />
					</svg>
				{:else if variant === 'error'}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="10" cy="10" r="7.5" />
						<path d="m7.75 7.75 4.5 4.5m0-4.5-4.5 4.5" />
					</svg>
				{:else}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="10" cy="10" r="7.5" />
						<path d="M10 9v4.25M10 6.5h.01" />
					</svg>
				{/if}
			</span>
			<div class="flex-1">
				{#if title}
					<h3 class="font-sans text-sm font-semibold {style.title}">{title}</h3>
				{/if}
				<div class="text-[14px] leading-relaxed {style.text}" class:mt-1={title}>
					{@render children()}
				</div>
			</div>
			{#if dismissible}
				<button
					type="button"
					class="-mr-1 -mt-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-fluid hover:bg-charcoal-900/[0.06] {style.icon}"
					onclick={handleDismiss}
				>
					<span class="sr-only">Dismiss</span>
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
						<path d="m4 4 8 8M12 4l-8 8" />
					</svg>
				</button>
			{/if}
		</div>
	</div>
{/if}
