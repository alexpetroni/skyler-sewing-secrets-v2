<script lang="ts">
	import type { PricingConfig } from '$lib/types';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		pricing?: PricingConfig | null;
	}

	let { pricing = null }: Props = $props();

	const defaultPrice = 14900;
	const priceInPence = $derived(pricing?.base_price ?? defaultPrice);
	const price = $derived(priceInPence / 100);
	const currency = $derived(pricing?.currency?.toUpperCase() ?? 'GBP');

	function formatPrice(amount: number, curr: string): string {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: curr,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}
</script>

<section class="relative isolate overflow-hidden bg-charcoal-950">
	<div class="aurora left-[-6%] top-[-10rem] h-[30rem] w-[30rem] bg-brand-700/25 animate-breathe" aria-hidden="true"></div>
	<div class="aurora bottom-[-14rem] right-[-6%] h-[32rem] w-[32rem] bg-sage-700/25" aria-hidden="true"></div>

	<div class="container-default py-28 sm:py-36">
		<div class="mx-auto max-w-3xl text-center" use:reveal>
			<span class="eyebrow border-0 bg-white/[0.07] text-ivory-200 ring-white/10">
				<span class="h-1 w-1 rounded-full bg-gold-400"></span>
				Enrolment open
			</span>

			<h2 class="mt-8 font-serif text-[2.75rem] leading-[1.02] tracking-tight text-ivory-50 sm:text-[4rem]">
				Start where you are.
				<span class="block italic text-brand-300">Finish like an atelier.</span>
			</h2>

			<p class="mx-auto mt-7 max-w-xl text-[17px] leading-[1.75] text-charcoal-300">
				Lifetime membership for {formatPrice(price, currency)}, paid once. No hidden fees, no recurring
				payments, and every future update included.
			</p>

			<div class="mt-11 flex flex-wrap items-center justify-center gap-4">
				<a
					href="/checkout"
					class="btn btn-lg group bg-ivory-50 text-charcoal-900 shadow-float hover:bg-white"
				>
					Get started
					<span class="btn-orb bg-charcoal-900/[0.08]" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
						</svg>
					</span>
				</a>
				<a
					href="/modules"
					class="btn btn-lg group text-ivory-200 ring-1 ring-inset ring-white/15 hover:bg-white/[0.06] hover:text-ivory-50"
				>
					Browse modules
					<span class="btn-orb bg-white/10" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
						</svg>
					</span>
				</a>
			</div>

			<p class="mt-8 text-[12px] text-charcoal-500">Secure payment via Stripe · Promo codes apply at checkout</p>
		</div>
	</div>
</section>
