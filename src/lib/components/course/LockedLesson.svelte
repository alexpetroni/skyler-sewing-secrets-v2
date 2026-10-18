<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import AddToCartButton from '#lib/components/shop/AddToCartButton.svelte';
	import { formatPence } from '#lib/shared/money.ts';
	import type { UnlockOffer } from './types.ts';

	interface Props {
		title: string;
		description: string | null;
		/** The cheapest product listing the lesson (may be the flagship itself). */
		cheapest: UnlockOffer | null;
		/** The all-access course, shown next to the cheaper option. */
		flagship: UnlockOffer | null;
		/** Sign-in link for anonymous visitors, returning to this lesson; null when signed in. */
		signInHref: string | null;
	}

	let { title, description, cheapest, flagship, signInHref }: Props = $props();

	const KIND_LABELS: Record<UnlockOffer['kind'], string> = {
		course: 'Full course',
		bundle: 'Bundle',
		single: 'This video'
	};

	// The flagship last, and only once when it is also the cheapest option.
	const offers = $derived(
		[cheapest?.slug === flagship?.slug ? null : cheapest, flagship].filter(
			(offer): offer is UnlockOffer => offer !== null
		)
	);
</script>

<div class="shell shadow-ambient">
	<div class="core px-8 py-12 text-center sm:px-12">
		<span
			class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-charcoal-500"
		>
			<svg
				class="h-5 w-5"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.75" />
				<path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" />
			</svg>
		</span>

		<h2 class="subsection-heading mt-6 text-balance">{title}</h2>
		{#if description}
			<p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-charcoal-600">
				{description}
			</p>
		{/if}

		{#if offers.length > 0}
			<p class="mx-auto mt-6 max-w-md text-[14px] text-charcoal-500">
				This lesson is locked. Unlock it with:
			</p>
			<ul class="mx-auto mt-6 grid max-w-xl gap-3 {offers.length > 1 ? 'sm:grid-cols-2' : ''}">
				{#each offers as offer (offer.slug)}
					<li
						class="flex h-full flex-col rounded-2xl bg-white p-5 text-left ring-1 ring-charcoal-900/[0.06] transition-all duration-600 ease-fluid ring-inset hover:-translate-y-0.5 hover:shadow-lift"
					>
						<a href="/products/{offer.slug}" class="group block">
							<span class="block text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
								{KIND_LABELS[offer.kind]}
							</span>
							<span
								class="mt-2 block truncate text-[14px] font-medium text-charcoal-900 transition-colors duration-400 ease-fluid group-hover:text-brand-700"
							>
								{offer.title}
							</span>
							<span class="mt-3 flex items-baseline gap-2">
								<span class="font-serif text-[1.5rem] leading-none text-charcoal-900">
									{formatPence(offer.pricing.price)}
								</span>
								{#if offer.pricing.onSale}
									<s class="text-[13px] text-charcoal-400">{formatPence(offer.pricing.listPrice)}</s
									>
								{/if}
							</span>
						</a>
						<AddToCartButton productId={offer.id} size="sm" class="mt-auto pt-4" />
					</li>
				{/each}
			</ul>
		{/if}

		{#if signInHref}
			<p class="mt-8 text-[14px] text-charcoal-500">
				Already own it? <a href={signInHref} class="link">Sign in</a>
			</p>
		{/if}
	</div>
</div>
