<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'sage' | 'danger' | 'success';
	type Size = 'sm' | 'md' | 'lg';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: Size;
		loading?: boolean;
		fullWidth?: boolean;
		/** Nests a trailing arrow inside its own circular island. */
		arrow?: boolean;
		children: Snippet;
		icon?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		fullWidth = false,
		arrow = false,
		disabled = false,
		type = 'button',
		class: className = '',
		children,
		icon,
		...restProps
	}: Props = $props();

	const variantClasses: Record<Variant, string> = {
		primary: 'btn-primary',
		secondary: 'btn-secondary',
		ghost: 'btn-ghost',
		accent: 'btn-accent',
		sage: 'btn-sage',
		danger: 'btn bg-red-700 text-white shadow-ambient hover:bg-red-800 hover:shadow-lift',
		success: 'btn bg-sage-600 text-white shadow-ambient hover:bg-sage-700 hover:shadow-lift'
	};

	const sizeClasses: Record<Size, string> = {
		sm: 'btn-sm',
		md: '',
		lg: 'btn-lg'
	};

	const classes = $derived(
		['group', variantClasses[variant], sizeClasses[size], fullWidth ? 'w-full' : '', className]
			.filter(Boolean)
			.join(' ')
	);
</script>

<button {type} class={classes} disabled={disabled || loading} {...restProps}>
	{#if loading}
		<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
			<path
				class="opacity-90"
				d="M22 12a10 10 0 0 0-10-10"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
	{:else if icon}
		{@render icon()}
	{/if}
	{@render children()}
	{#if arrow && !loading}
		<span class="btn-orb" aria-hidden="true">
			<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
			</svg>
		</span>
	{/if}
</button>
