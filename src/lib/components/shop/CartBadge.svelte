<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */

	interface Props {
		/** Products in the cart cookie. */
		count: number;
	}

	let { count }: Props = $props();

	const label = $derived(
		count === 0 ? 'Cart, empty' : `Cart, ${count} ${count === 1 ? 'item' : 'items'}`
	);
</script>

<a
	href="/cart"
	class="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-charcoal-700 transition-colors duration-400 ease-fluid hover:bg-charcoal-900/[0.05]"
	aria-label={label}
>
	<svg
		class="h-[18px] w-[18px]"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M3.25 5.25h9.5l-.8 7.2a1.5 1.5 0 0 1-1.49 1.3H5.54a1.5 1.5 0 0 1-1.49-1.3l-.8-7.2Z" />
		<path d="M5.75 5.25V4.5a2.25 2.25 0 0 1 4.5 0v.75" />
	</svg>
	{#if count > 0}
		<span
			class="absolute -top-0.5 -right-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-charcoal-900 px-1 text-[10px] font-semibold text-ivory-50"
			aria-hidden="true"
		>
			{count}
		</span>
	{/if}
</a>
