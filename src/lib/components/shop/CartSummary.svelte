<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import type { Snippet } from 'svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import AddToCartButton from './AddToCartButton.svelte';

	interface Props {
		subtotal: number;
		discountTotal: number;
		total: number;
		/** The applied code; null when none applies. */
		promoCode: string | null;
		/** The cart is worth enough of the course price to suggest the course instead. */
		suggestFlagship: boolean;
		/** The all-access course the nudge offers. */
		flagship: { id: string; slug: string; title: string; price: number } | null;
		/** The promo field, rendered above the totals. */
		promo?: Snippet;
	}

	let { subtotal, discountTotal, total, promoCode, suggestFlagship, flagship, promo }: Props =
		$props();
</script>

<div class="shell shadow-float">
	<div class="core p-7">
		<h2 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Order summary</h2>

		{#if promo}
			<div class="mt-6">{@render promo()}</div>
		{/if}

		<dl class="mt-6 space-y-3 border-t border-charcoal-900/[0.07] pt-6 text-[14px]">
			<div class="flex justify-between text-charcoal-600">
				<dt>Subtotal</dt>
				<dd>{formatPence(subtotal)}</dd>
			</div>
			{#if discountTotal > 0}
				<div class="flex justify-between text-sage-700">
					<dt>Discount{promoCode ? ` (${promoCode})` : ''}</dt>
					<dd>−{formatPence(discountTotal)}</dd>
				</div>
			{/if}
			<div
				class="flex items-baseline justify-between border-t border-charcoal-900/[0.07] pt-4 text-charcoal-900"
			>
				<dt class="font-medium">Total</dt>
				<dd class="font-serif text-[2rem] leading-none">{formatPence(total)}</dd>
			</div>
		</dl>

		<a href="/checkout" class="btn-primary btn-lg group mt-7 w-full">
			Checkout
			<span class="btn-orb" aria-hidden="true">
				<svg
					class="h-3.5 w-3.5"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.25"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
				</svg>
			</span>
		</a>
		<p class="mt-4 text-center text-[12px] text-charcoal-400">
			Secured by Stripe. Card details never touch this site.
		</p>

		{#if suggestFlagship && flagship}
			<div class="mt-7 rounded-2xl bg-ivory-100/80 p-5 ring-1 ring-charcoal-900/[0.06] ring-inset">
				<p class="text-[13px] font-semibold text-charcoal-800">Thinking of the full course?</p>
				<p class="mt-1 text-[13px] leading-relaxed text-charcoal-600">
					<a href="/products/{flagship.slug}" class="link">{flagship.title}</a> unlocks every
					lesson, now and in the future, for {formatPence(flagship.price)} — one payment, lifetime access.
				</p>
				<AddToCartButton
					productId={flagship.id}
					label="Add the full course"
					size="sm"
					class="mt-4"
				/>
			</div>
		{/if}
	</div>
</div>
