<script lang="ts">
	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		src?: string | null;
		alt?: string;
		name?: string;
		size?: Size;
		class?: string;
	}

	let { src, alt = '', name = '', size = 'md', class: className = '' }: Props = $props();

	const sizeClasses: Record<Size, string> = {
		xs: 'h-6 w-6 text-[10px]',
		sm: 'h-8 w-8 text-xs',
		md: 'h-10 w-10 text-sm',
		lg: 'h-12 w-12 text-base',
		xl: 'h-14 w-14 text-lg'
	};

	function getInitials(value: string): string {
		return value
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	const initials = $derived(getInitials(name || alt));
</script>

{#if src}
	<img
		{src}
		{alt}
		class="inline-block rounded-full object-cover ring-1 ring-charcoal-900/[0.06] {sizeClasses[size]} {className}"
	/>
{:else}
	<span
		class="inline-flex items-center justify-center rounded-full bg-sage-100 font-medium leading-none text-sage-700 ring-1 ring-inset ring-sage-700/10 {sizeClasses[
			size
		]} {className}"
	>
		{initials || '·'}
	</span>
{/if}
