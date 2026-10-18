<script lang="ts">
	import { formatPence } from '#lib/shared/money.ts';

	interface Props {
		/** What the buyer pays now, in pence. */
		price: number;
		/** The full price, struck through while a sale runs. */
		listPrice: number;
		onSale: boolean;
		/** End of the running sale; shown as “ends 3 Oct”. */
		saleEndsAt?: string | null;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let {
		price,
		listPrice,
		onSale,
		saleEndsAt = null,
		size = 'md',
		class: className = ''
	}: Props = $props();

	const SIZES = {
		sm: 'text-[1.25rem]',
		md: 'text-[1.75rem]',
		lg: 'text-[3rem] tracking-tight'
	} as const;

	const endsOn = $derived(
		onSale && saleEndsAt
			? new Date(saleEndsAt).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					timeZone: 'Europe/London'
				})
			: null
	);
</script>

<span class="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 {className}">
	<span class="font-serif leading-none text-charcoal-900 {SIZES[size]}">
		{#if onSale}
			<span class="sr-only">Now</span>
		{/if}
		{formatPence(price)}
	</span>
	{#if onSale}
		<s class="text-[13px] text-charcoal-400"
			><span class="sr-only">Was</span> {formatPence(listPrice)}</s
		>
		{#if endsOn}
			<span class="text-[11px] tracking-eyebrow text-brand-700 uppercase">ends {endsOn}</span>
		{/if}
	{/if}
</span>
