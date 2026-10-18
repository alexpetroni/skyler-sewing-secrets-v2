<script lang="ts">
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		size?: Size;
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const sizeClasses: Record<Size, string> = {
		sm: 'h-4 w-4',
		md: 'h-6 w-6',
		lg: 'h-8 w-8'
	};
</script>

<svg
	class="animate-spin text-sage-600 {sizeClasses[size]} {className}"
	viewBox="0 0 24 24"
	fill="none"
	role="status"
	aria-label="Loading"
>
	<circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
	<path
		class="opacity-90"
		d="M22 12a10 10 0 0 0-10-10"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
	/>
</svg>
