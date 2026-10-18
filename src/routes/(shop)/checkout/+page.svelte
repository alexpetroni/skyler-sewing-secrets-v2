<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import OAuthButtons from '#lib/components/auth/OAuthButtons.svelte';
	import { KIND_LABELS } from '#lib/components/shop/types.ts';
	import { Alert, Input } from '#lib/components/ui/index.ts';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const quote = $derived(data.quote);
	let isSubmitting = $state(false);

	const errors = $derived<Record<string, string>>(
		form && 'errors' in form && form.errors ? form.errors : {}
	);
	const formError = $derived(form && 'error' in form ? form.error : null);
	const fullName = $derived(form && 'fullName' in form ? form.fullName : '');
	const email = $derived(form && 'email' in form ? form.email : '');
</script>

<Seo
	title="Checkout - Skyler's Sewing Secrets"
	description="Complete your purchase at Skyler's Sewing Secrets. One payment, and it's yours to keep."
	noindex
/>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-28 left-[-8%] h-[28rem] w-[28rem] animate-breathe bg-brand-200/30"
		aria-hidden="true"
	></div>
	<div
		class="aurora right-[-8%] -bottom-40 h-[28rem] w-[28rem] bg-sage-200/30"
		aria-hidden="true"
	></div>

	<div class="container-default py-14 sm:py-20">
		<div class="grid gap-12 lg:grid-cols-12 lg:gap-14">
			<!-- What you're buying -->
			<div class="lg:col-span-6">
				<span class="eyebrow" use:reveal>Checkout</span>
				<h1 class="page-title mt-6 text-balance" use:reveal={{ delay: 60 }}>
					Complete your purchase
				</h1>
				<p class="section-description mt-6 max-w-reading" use:reveal={{ delay: 120 }}>
					Lifetime access to everything in your cart. One payment, and it's yours to keep.
				</p>

				<div class="shell-sage mt-12 shadow-ambient" use:reveal={{ delay: 180 }}>
					<div class="core p-7 sm:p-8">
						<h2
							class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
						>
							Your order
							<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
						</h2>
						<ul class="mt-6 divide-y divide-charcoal-900/[0.06]">
							{#each quote.lines as line (line.productId)}
								<li class="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
									<div class="min-w-0">
										<span class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
											{KIND_LABELS[line.kind]}
										</span>
										<p class="truncate text-[15px] font-medium text-charcoal-900">{line.title}</p>
										{#if line.discount > 0}
											<p class="text-[13px] text-sage-700">
												Code saves {formatPence(line.discount)}
											</p>
										{/if}
									</div>
									<div class="shrink-0 text-right">
										{#if line.discount > 0 || line.onSale}
											<p class="text-[13px] text-charcoal-400 line-through">
												{formatPence(line.discount > 0 ? line.effectivePrice : line.listPrice)}
											</p>
										{/if}
										<p class="text-[15px] font-medium text-charcoal-900">
											{formatPence(line.unitAmount)}
										</p>
									</div>
								</li>
							{/each}
						</ul>

						<dl class="mt-6 space-y-2 border-t border-charcoal-900/[0.08] pt-5 text-[14px]">
							<div class="flex justify-between text-charcoal-600">
								<dt>Subtotal</dt>
								<dd>{formatPence(quote.subtotal)}</dd>
							</div>
							{#if quote.discountTotal > 0}
								<div class="flex justify-between text-sage-700">
									<dt>Code {quote.promo?.code} applied</dt>
									<dd>−{formatPence(quote.discountTotal)}</dd>
								</div>
							{/if}
							<div class="flex items-end justify-between pt-3">
								<dt>
									<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Total</p>
									<p class="mt-1 text-[13px] text-charcoal-500">
										One-time payment, no recurring fees
									</p>
								</dt>
								<dd class="font-serif text-[2.5rem] leading-none text-charcoal-900">
									{formatPence(quote.total)}
								</dd>
							</div>
						</dl>

						<p class="mt-6 text-[13px]">
							<a href="/cart" class="link">Edit your cart</a>
						</p>
					</div>
				</div>
			</div>

			<!-- The form -->
			<div class="lg:col-span-6">
				<div class="shell-lg shadow-float lg:sticky lg:top-28" use:reveal={{ delay: 100 }}>
					<div class="core-lg px-7 py-9 sm:px-9 sm:py-10">
						{#if data.signedIn}
							<div class="mb-6">
								<Alert variant="info">
									You're signed in as {data.signedIn.email}. Complete your purchase below.
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
							use:enhance={() => {
								isSubmitting = true;
								return async ({ result, update }) => {
									// Stripe is another origin: `goto` cannot follow the redirect.
									if (result.type === 'redirect') {
										window.location.href = result.location;
										return;
									}
									isSubmitting = false;
									await update({ reset: false });
								};
							}}
							class="space-y-5"
						>
							{#if !data.signedIn}
								<h2 class="subsection-heading">Create your account</h2>

								<Input
									label="Full name"
									name="fullName"
									type="text"
									autocomplete="name"
									required
									value={fullName}
									error={errors.fullName}
								/>

								<Input
									label="Email address"
									name="email"
									type="email"
									autocomplete="email"
									required
									value={email}
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

								{#if data.googleEnabled}
									<div class="relative pt-2">
										<div class="absolute inset-x-0 top-1/2 flex items-center" aria-hidden="true">
											<div class="w-full border-t border-charcoal-900/[0.08]"></div>
										</div>
										<div class="relative flex justify-center">
											<span
												class="bg-white px-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
											>
												Or sign up with
											</span>
										</div>
									</div>

									<OAuthButtons redirectTo="/checkout" action="sign-up" />
								{/if}

								<div class="border-t border-charcoal-900/[0.08] pt-1"></div>
							{/if}

							<button type="submit" class="btn-primary btn-lg group w-full" disabled={isSubmitting}>
								{#if isSubmitting}
									Redirecting to payment…
								{:else if data.signedIn}
									Pay with Stripe — {formatPence(quote.total)}
								{:else}
									Continue to payment — {formatPence(quote.total)}
								{/if}
								{#if !isSubmitting}
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
								{/if}
							</button>

							<p class="text-center text-[12px] leading-relaxed text-charcoal-400">
								Secured by Stripe. By purchasing you agree to our
								<a
									href="/legal/terms-and-conditions"
									class="underline underline-offset-2 hover:text-charcoal-700"
								>
									Terms &amp; Conditions
								</a>
								and
								<a
									href="/legal/privacy"
									class="underline underline-offset-2 hover:text-charcoal-700"
								>
									Privacy Policy
								</a>.
							</p>
						</form>

						{#if !data.signedIn}
							<p
								class="mt-7 border-t border-charcoal-900/[0.07] pt-6 text-center text-[14px] text-charcoal-500"
							>
								Already a member?
								<a href="/auth/sign-in?redirectTo=%2Fcheckout" class="link">Sign in</a>
							</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
