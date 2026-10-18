<script lang="ts">
	import type { PricingConfig } from '$lib/types';
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		pricing: PricingConfig | null;
	}

	let { pricing }: Props = $props();

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

	const includedFeatures = [
		`${courseOverview.totals.modules + courseOverview.totals.bonus_modules} structured modules`,
		`${courseOverview.totals.videos} videos and ${courseOverview.totals.slides} slides tutorials`,
		'Approx. 4½ hours of video content',
		'Professional couture techniques',
		'From basics to advanced projects',
		'HD video streaming',
		'Watch on any device',
		'Lifetime access with future updates',
		'Bonus Chanel inspired Skirt video tutorial',
		'Learn at your own pace'
	];

	const reassurances = [
		{ title: 'One payment, then nothing', body: 'No subscription, no renewal date, no upsell waiting behind the next lesson.' },
		{ title: 'Yours to keep', body: 'Come back to a technique in five years and it will still be there, updates included.' },
		{ title: 'Secured by Stripe', body: 'Card details never touch this site. Promo codes apply at checkout.' }
	];
</script>

<section class="section-alt border-y border-charcoal-900/[0.06]" id="pricing">
	<div class="container-default section">
		<div class="section-header" use:reveal>
			<span class="eyebrow">One-time payment</span>
			<h2 class="section-title mt-6 text-balance">Invest once in your sewing</h2>
			<p class="section-description mt-5">
				Complete access to the entire course for a single payment. No subscriptions, no hidden fees.
			</p>
		</div>

		<!-- Offer plate: contents on the left, the decision on the right. -->
		<div class="mx-auto max-w-6xl" use:reveal={{ delay: 100 }}>
			<div class="shell-lg shadow-float">
				<div class="grid overflow-hidden rounded-core-lg bg-white lg:grid-cols-12">
					<div class="p-8 sm:p-11 lg:col-span-7">
						<h3 class="subsection-heading">Complete course access</h3>
						<p class="mt-4 max-w-reading text-[15px] leading-[1.75] text-charcoal-600">
							Master professional sewing techniques with Skyler's comprehensive video course. Elevate
							your craft with professional couture techniques — perfect for passionate hobbyists,
							fashion students, and professionals alike.
						</p>

						<div class="mt-10 flex items-center gap-4">
							<h4 class="shrink-0 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
								What's included
							</h4>
							<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
						</div>

						<ul class="mt-7 grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
							{#each includedFeatures as feature}
								<li class="flex gap-3 text-[15px] leading-snug text-charcoal-600">
									<svg class="mt-0.5 h-4 w-4 shrink-0 text-sage-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
										<path d="m3.5 8.5 3 3 6-7" />
									</svg>
									{feature}
								</li>
							{/each}
						</ul>
					</div>

					<div class="relative flex flex-col justify-center gap-8 border-t border-charcoal-900/[0.07] bg-ivory-100/70 p-8 sm:p-11 lg:col-span-5 lg:border-l lg:border-t-0">
						<div class="text-center">
							<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">
								Pay once, own it forever
							</p>
							<p class="mt-5 font-serif text-[3.5rem] leading-none tracking-tight text-charcoal-900">
								{formatPrice(price, currency)}
							</p>
							<a href="/checkout" class="btn-primary btn-lg group mt-8 w-full">
								Get lifetime access
								<span class="btn-orb" aria-hidden="true">
									<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
										<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
									</svg>
								</span>
							</a>
						</div>

						<ul class="space-y-4 border-t border-charcoal-900/[0.07] pt-7">
							{#each reassurances as item}
								<li>
									<p class="text-[13px] font-semibold text-charcoal-800">{item.title}</p>
									<p class="mt-1 text-[13px] leading-relaxed text-charcoal-500">{item.body}</p>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
