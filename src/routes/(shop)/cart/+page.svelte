<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import Seo from '#lib/components/Seo.svelte';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import CartLines from '#lib/components/shop/CartLines.svelte';
	import CartSummary from '#lib/components/shop/CartSummary.svelte';
	import PromoField from '#lib/components/shop/PromoField.svelte';
	import Alert from '#lib/components/ui/Alert.svelte';
	import { cartRemovalReasons } from '#lib/shared/schemas/commerce.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const quote = $derived(data.quote);

	type CartRemovalReason = (typeof cartRemovalReasons)[number];

	const NOTICES: Record<CartRemovalReason, (count: number) => string> = {
		owned: (n) =>
			n === 1
				? 'You already own one of the items you added, so it has been taken out of your cart.'
				: `You already own ${n} of the items you added, so they have been taken out of your cart.`,
		unpublished: (n) =>
			n === 1
				? 'An item in your cart is no longer available and has been removed.'
				: `${n} items in your cart are no longer available and have been removed.`,
		included_in_course: () =>
			'The full course includes every lesson, so the items it already covers have been removed.',
		duplicate: () => 'A duplicate item has been removed from your cart.'
	};

	// One notice per reason, with how many products it covers.
	const notices = $derived(
		cartRemovalReasons
			.map((reason) => ({
				reason,
				count: quote.removed.filter((removal) => removal.reason === reason).length
			}))
			.filter(({ count }) => count > 0)
			.map(({ reason, count }) => ({ reason, text: NOTICES[reason](count) }))
	);

	const formError = $derived(form && 'error' in form ? form.error : null);
	const promoError = $derived(form && 'promoError' in form ? form.promoError : null);
</script>

<Seo
	title="Your cart - Skyler's Sewing Secrets"
	description="Your cart at Skyler's Sewing Secrets."
	noindex
/>

<PageHeader eyebrow="Your cart" title="Your cart" compact />

<section class="container-default pb-24 sm:pb-32">
	{#if notices.length > 0 || formError}
		<div class="mb-8 space-y-3">
			{#each notices as notice (notice.reason)}
				<Alert variant="info">{notice.text}</Alert>
			{/each}
			{#if formError}
				<Alert variant="error">{formError}</Alert>
			{/if}
		</div>
	{/if}

	{#if quote.lines.length === 0}
		<div class="mx-auto max-w-md py-12 text-center">
			<p class="subsection-heading">Your cart is empty</p>
			<p class="mt-3 text-[15px] leading-relaxed text-charcoal-600">
				Browse the full course, bundles and single videos.
			</p>
			<a href="/catalogue" class="btn-primary mt-8">Browse the catalogue</a>
		</div>
	{:else}
		<div class="grid gap-10 lg:grid-cols-12">
			<div class="lg:col-span-7">
				<div class="shell shadow-ambient">
					<div class="core p-7">
						<CartLines lines={quote.lines} />
					</div>
				</div>
				<div class="mt-5 flex items-center justify-between">
					<a href="/catalogue" class="link text-[14px]">Continue shopping</a>
					<form method="POST" action="?/clear" use:enhance>
						<button
							type="submit"
							class="text-[13px] text-charcoal-500 underline-offset-4 transition-colors duration-400 ease-fluid hover:text-charcoal-900 hover:underline"
						>
							Empty cart
						</button>
					</form>
				</div>
			</div>

			<div class="lg:col-span-5">
				<CartSummary
					subtotal={quote.subtotal}
					discountTotal={quote.discountTotal}
					total={quote.total}
					promoCode={quote.promo?.code ?? null}
					suggestFlagship={quote.suggestFlagship}
					flagship={data.flagship}
				>
					{#snippet promo()}
						<PromoField code={quote.promoCode} rejection={quote.rejection} error={promoError} />
					{/snippet}
				</CartSummary>
			</div>
		</div>
	{/if}
</section>
