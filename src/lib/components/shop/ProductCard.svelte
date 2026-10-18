<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import Badge from '#lib/components/ui/Badge.svelte';
	import { durationMinutes, formatMinutes } from '#lib/shared/lessons.ts';
	import AddToCartButton from './AddToCartButton.svelte';
	import PriceTag from './PriceTag.svelte';
	import { KIND_LABELS, type ShopProduct } from './types.ts';

	interface Props {
		product: ShopProduct;
		/** The viewer owns it (directly or through the course). */
		owned?: boolean;
		inCart?: boolean;
	}

	let { product, owned = false, inCart = false }: Props = $props();

	const href = $derived(`/products/${product.slug}`);
	const videos = $derived(`${product.itemCount} ${product.itemCount === 1 ? 'video' : 'videos'}`);
	const minutes = $derived(durationMinutes(product.durationSeconds));
</script>

<article class="shell flex h-full flex-col shadow-ambient">
	<div class="core flex h-full flex-col overflow-hidden">
		<a {href} class="group relative block aspect-[16/10] overflow-hidden bg-ivory-100">
			{#if product.coverImageUrl}
				<img
					src={product.coverImageUrl}
					alt=""
					loading="lazy"
					class="h-full w-full object-cover transition-transform duration-700 ease-fluid group-hover:scale-[1.03]"
				/>
			{/if}
			<span class="absolute top-4 left-4">
				<Badge variant={product.kind === 'course' ? 'brand' : 'gray'} size="sm">
					{KIND_LABELS[product.kind]}
				</Badge>
			</span>
			{#if owned}
				<span class="absolute top-4 right-4">
					<Badge variant="sage" size="sm" dot>Owned</Badge>
				</span>
			{/if}
		</a>

		<div class="flex flex-1 flex-col p-6">
			<h3 class="card-title text-balance">
				<a {href} class="transition-colors duration-400 ease-fluid hover:text-brand-700">
					{product.title}
				</a>
			</h3>
			{#if product.tagline}
				<p class="mt-2 text-[14px] leading-relaxed text-charcoal-600">{product.tagline}</p>
			{/if}
			<p class="meta mt-4">
				{videos}{#if minutes}<span aria-hidden="true"> · </span>{formatMinutes(minutes)}{/if}
			</p>

			<div class="mt-auto flex flex-wrap items-end justify-between gap-4 pt-6">
				<PriceTag
					price={product.pricing.price}
					listPrice={product.pricing.listPrice}
					onSale={product.pricing.onSale}
					saleEndsAt={product.pricing.saleEndsAt}
				/>
				<div class="flex items-center gap-2">
					<a {href} class="btn-ghost btn-sm">View</a>
					{#if !owned}
						<AddToCartButton productId={product.id} {inCart} size="sm" />
					{/if}
				</div>
			</div>
		</div>
	</div>
</article>
