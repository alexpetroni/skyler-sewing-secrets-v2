<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		padding?: 'none' | 'sm' | 'md' | 'lg';
		/** Sage-tinted outer tray, for cards that carry reassurance rather than data. */
		tone?: 'default' | 'sage';
		/** Lifts on hover — only for cards that are themselves interactive. */
		interactive?: boolean;
		class?: string;
		children: Snippet;
		header?: Snippet;
		footer?: Snippet;
	}

	let {
		padding = 'md',
		tone = 'default',
		interactive = false,
		class: className = '',
		children,
		header,
		footer
	}: Props = $props();

	const paddingClasses: Record<string, string> = {
		none: '',
		sm: 'p-4 sm:p-5',
		md: 'p-6 sm:p-7',
		lg: 'p-8 sm:p-10'
	};

	const shell = $derived(tone === 'sage' ? 'shell-sage' : 'shell');
</script>

<!-- Double-bezel: an inner plate seated in an outer tray, radii concentric. -->
<div
	class="{shell} shadow-ambient transition-all duration-600 ease-fluid {interactive
		? 'hover:-translate-y-1 hover:shadow-float'
		: ''} {className}"
>
	<div class="core overflow-hidden">
		{#if header}
			<div class="border-b border-charcoal-900/[0.06] px-6 py-5 sm:px-7">
				{@render header()}
			</div>
		{/if}

		<div class={paddingClasses[padding]}>
			{@render children()}
		</div>

		{#if footer}
			<div class="border-t border-charcoal-900/[0.06] bg-ivory-50/70 px-6 py-4 sm:px-7">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
