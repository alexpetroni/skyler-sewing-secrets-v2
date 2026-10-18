<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { Input, Alert } from '$lib/components/ui';
	import OAuthButtons from '$lib/components/auth/OAuthButtons.svelte';
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let promoCode = $state('');
	let isSubmitting = $state(false);

	// Local state for action errors (more reliable than form prop in Svelte 5)
	let errors = $state<Record<string, string>>({});
	let formError = $state('');
	let promoError = $state('');

	const errorMessages: Record<string, string> = {
		payment_incomplete: 'Your payment was not completed. Please try again.',
		invalid_session: 'Your checkout session has expired. Please try again.',
		signup_failed: 'There was a problem creating your account. Please try again.'
	};

	const includedFeatures = [
		`${courseOverview.totals.modules + courseOverview.totals.bonus_modules} structured modules`,
		`${courseOverview.totals.videos} videos and ${courseOverview.totals.slides} slides tutorials`,
		`Over ${Math.floor(courseOverview.totals.minutes / 60)} hours of video content`,
		'Professional couture techniques',
		'From basics to advanced projects',
		'HD video streaming',
		'Watch on any device',
		'Lifetime access with future updates',
		'Bonus Chanel inspired Skirt video tutorial',
		'Learn at your own pace'
	];

	function formatPrice(amountInPence: number): string {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: 'GBP'
		}).format(amountInPence / 100);
	}
</script>

<svelte:head>
	<title>Enroll Now - Skyler's Sewing Secrets</title>
	<meta name="description" content="Get lifetime access to professional sewing tutorials. Learn couture techniques, seams, zippers, pockets, and fabric manipulation from expert Skyler." />
	<meta property="og:title" content="Enroll Now - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Get lifetime access to professional sewing tutorials. Learn couture techniques, seams, zippers, pockets, and fabric manipulation from expert Skyler." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/checkout" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-28 left-[-8%] h-[28rem] w-[28rem] bg-brand-200/30 animate-breathe" aria-hidden="true"></div>
	<div class="aurora -bottom-40 right-[-8%] h-[28rem] w-[28rem] bg-sage-200/30" aria-hidden="true"></div>

	<div class="container-default py-14 sm:py-20">
		<div class="grid gap-12 lg:grid-cols-12 lg:gap-14">
			<!-- What you're buying -->
			<div class="lg:col-span-6">
				<span class="eyebrow" use:reveal>Enrolment</span>
				<h1 class="page-title mt-6 text-balance" use:reveal={{ delay: 60 }}>
					Join Skyler's Sewing Secrets
				</h1>
				<p class="section-description mt-6 max-w-reading" use:reveal={{ delay: 120 }}>
					Lifetime access to every module, tutorial and resource. One payment, and it's yours to keep.
				</p>

				<div class="mt-12" use:reveal={{ delay: 180 }}>
					<h2 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
						What's included
						<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
					</h2>
					<ul class="mt-7 grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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

				<div class="mt-12 shell-sage shadow-ambient" use:reveal={{ delay: 240 }}>
					<div class="core p-7 sm:p-8">
						<div class="flex flex-wrap items-end justify-between gap-4">
							<div>
								<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Lifetime access</p>
								<p class="mt-2 text-[13px] text-charcoal-500">One-time payment, no recurring fees</p>
							</div>
							<div class="text-right">
								{#if data.appliedPromo}
									<p class="text-[13px] text-charcoal-400 line-through">
										{formatPrice(data.pricing.base_price)}
									</p>
									<p class="font-serif text-[2.5rem] leading-none text-charcoal-900">
										{formatPrice(data.finalPrice)}
									</p>
									<p class="mt-1 text-[12px] font-medium text-sage-700">
										{data.appliedPromo.discount_type === 'percentage'
											? `${data.appliedPromo.discount_value}% off`
											: `${formatPrice(data.appliedPromo.discount_value)} off`}
									</p>
								{:else}
									<p class="font-serif text-[2.5rem] leading-none text-charcoal-900">
										{formatPrice(data.pricing.base_price)}
									</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- The form -->
			<div class="lg:col-span-6">
				<div class="shell-lg shadow-float lg:sticky lg:top-28" use:reveal={{ delay: 100 }}>
					<div class="core-lg px-7 py-9 sm:px-9 sm:py-10">
						{#if data.user}
							<div class="mb-6">
								<Alert variant="info">
									You're signed in as {data.user.email}. Complete your purchase below.
								</Alert>
							</div>
						{/if}

						{#if data.urlError}
							<div class="mb-6">
								<Alert variant="error">
									{errorMessages[data.urlError] ?? 'Something went wrong. Please try again.'}
								</Alert>
							</div>
						{/if}

						{#if formError}
							<div class="mb-6">
								<Alert variant="error">{formError}</Alert>
							</div>
						{/if}

						<form
							method="POST"
							action="?/checkout"
							oninput={() => {
								errors = {};
								formError = '';
								promoError = '';
							}}
							use:enhance={() => {
								isSubmitting = true;
								errors = {};
								formError = '';
								promoError = '';
								return async ({ result }) => {
									if (result.type === 'redirect') {
										window.location.href = result.location;
										return;
									}
									isSubmitting = false;
									if (result.type === 'failure' && result.data) {
										const d = result.data as Record<string, unknown>;
										errors = (d.errors as Record<string, string>) ?? {};
										formError = (d.error as string) ?? '';
										promoError = (d.promoError as string) ?? '';
									} else if (result.type === 'success') {
										await invalidateAll();
									} else if (result.type === 'error') {
										formError = 'Something went wrong. Please try again.';
									}
								};
							}}
							class="space-y-5"
						>
							{#if !data.user}
								<h2 class="subsection-heading">Create your account</h2>

								<Input
									label="Full name"
									name="fullName"
									type="text"
									autocomplete="name"
									required
									error={errors.fullName}
								/>

								<Input
									label="Email address"
									name="email"
									type="email"
									autocomplete="email"
									required
									error={errors.email}
								/>

								<Input
									label="Password"
									name="password"
									type="password"
									autocomplete="new-password"
									required
									hint="At least 8 characters"
									error={errors.password}
								/>

								<div class="relative pt-2">
									<div class="absolute inset-x-0 top-1/2 flex items-center" aria-hidden="true">
										<div class="w-full border-t border-charcoal-900/[0.08]"></div>
									</div>
									<div class="relative flex justify-center">
										<span class="bg-white px-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
											Or sign up with
										</span>
									</div>
								</div>

								<OAuthButtons redirectTo="/checkout" action="sign-up" />

								<div class="border-t border-charcoal-900/[0.08] pt-1"></div>
							{/if}

							<div>
								<label for="promoCode" class="label">Promo code (optional)</label>
								<div class="flex gap-2">
									<input
										type="text"
										name="promoCode"
										id="promoCode"
										bind:value={promoCode}
										class="input"
										placeholder="Enter code"
									/>
									<button type="submit" formaction="?/applyPromo" class="btn-secondary shrink-0">
										Apply
									</button>
								</div>
								{#if promoError}
									<p class="mt-2 text-[13px] text-red-700">{promoError}</p>
								{/if}
								{#if data.appliedPromo}
									<p class="mt-2 text-[13px] text-sage-700">
										Code “{data.appliedPromo.code}” applied.
									</p>
								{/if}
							</div>

							<input type="hidden" name="promoCodeId" value={data.appliedPromo?.id ?? ''} />

							<button type="submit" class="btn-primary btn-lg group w-full" disabled={isSubmitting}>
								{isSubmitting
									? 'Redirecting to payment…'
									: `Continue to payment — ${formatPrice(data.finalPrice)}`}
								{#if !isSubmitting}
									<span class="btn-orb" aria-hidden="true">
										<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
											<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
										</svg>
									</span>
								{/if}
							</button>

							<p class="text-center text-[12px] leading-relaxed text-charcoal-400">
								Secured by Stripe. By enrolling you agree to our
								<a href="/legal/terms-and-conditions" class="underline underline-offset-2 hover:text-charcoal-700">Terms &amp; Conditions</a>
								and
								<a href="/legal/privacy" class="underline underline-offset-2 hover:text-charcoal-700">Privacy Policy</a>.
							</p>
						</form>

						<p class="mt-7 border-t border-charcoal-900/[0.07] pt-6 text-center text-[14px] text-charcoal-500">
							Already a member?
							<a href="/auth/sign-in" class="link">Sign in</a>
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
