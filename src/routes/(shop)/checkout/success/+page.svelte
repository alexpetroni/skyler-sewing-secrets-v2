<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import { Alert } from '#lib/components/ui/index.ts';
	import { formatPence } from '#lib/shared/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const summary = $derived(data.summary);
	/** Stripe has the money and the webhook has granted access. */
	const owned = $derived(summary.status === 'paid');
	/** Stripe has the money; fulfilment has not landed yet. */
	const finalising = $derived(data.paid && !owned);

	const steps = $derived([
		data.signedIn
			? 'Check your email for your receipt'
			: 'Sign in with the password you chose at checkout',
		'Visit your library to find everything you own',
		'Start with the first lesson to build a strong foundation',
		'Download the resources for each lesson as you progress'
	]);
</script>

<Seo
	title={owned ? "Welcome! - Skyler's Sewing Secrets" : "Your order - Skyler's Sewing Secrets"}
	description="Your purchase at Skyler's Sewing Secrets. Start learning professional sewing techniques today."
	noindex
/>

<svelte:head>
	{#if finalising}
		<meta http-equiv="refresh" content="3" />
	{/if}
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-32 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 animate-breathe bg-sage-200/40"
		aria-hidden="true"
	></div>

	<div class="mx-auto max-w-2xl px-5 py-24 text-center sm:py-32">
		{#if data.paid}
			<span
				class="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-sage-100 text-sage-700 shadow-ambient ring-1 ring-sage-700/10 ring-inset"
				use:reveal
			>
				<svg
					class="h-8 w-8"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.25"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="m5 12.5 4.5 4.5L19 7" />
				</svg>
			</span>
		{/if}

		{#if owned}
			<h1 class="page-title mt-9 text-balance" use:reveal={{ delay: 60 }}>
				Welcome to Skyler's Sewing Secrets
			</h1>
			<p class="section-description mx-auto mt-6" use:reveal={{ delay: 120 }}>
				Your payment is complete. Everything below is open to you — and stays that way.
			</p>
		{:else if finalising}
			<h1 class="page-title mt-9 text-balance" use:reveal={{ delay: 60 }}>
				Finalising your order…
			</h1>
			<p class="section-description mx-auto mt-6" use:reveal={{ delay: 120 }}>
				Your payment has gone through and we're unlocking your purchase. This page refreshes on its
				own; it only takes a moment.
			</p>
		{:else}
			<h1 class="page-title mt-9 text-balance" use:reveal={{ delay: 60 }}>Payment not completed</h1>
			<p class="section-description mx-auto mt-6" use:reveal={{ delay: 120 }}>
				Your payment was not completed and you have not been charged. Your cart is just as you left
				it.
			</p>
		{/if}

		<div class="shell mt-12 shadow-ambient" use:reveal={{ delay: 180 }}>
			<div class="core p-8 text-left sm:p-9">
				<h2 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
					{owned ? 'You now own' : 'Your order'}
				</h2>
				<ul class="mt-6 divide-y divide-charcoal-900/[0.06]">
					{#each summary.items as item (item.productId)}
						<li class="flex items-center justify-between gap-5 py-3 first:pt-0 last:pb-0">
							{#if owned && item.href}
								<a href={item.href} class="link text-[15px]">{item.title}</a>
							{:else}
								<span class="text-[15px] text-charcoal-900">{item.title}</span>
							{/if}
							<span class="shrink-0 text-[14px] text-charcoal-600"
								>{formatPence(item.unitPrice)}</span
							>
						</li>
					{/each}
				</ul>
				<dl class="mt-5 space-y-1.5 border-t border-charcoal-900/[0.08] pt-4 text-[14px]">
					{#if summary.discountTotal > 0}
						<div class="flex justify-between text-sage-700">
							<dt>Code {summary.promoCode} applied</dt>
							<dd>−{formatPence(summary.discountTotal)}</dd>
						</div>
					{/if}
					<div class="flex justify-between font-medium text-charcoal-900">
						<dt>Total</dt>
						<dd>{formatPence(summary.total)}</dd>
					</div>
				</dl>
			</div>
		</div>

		<div class="mt-10 space-y-4" use:reveal={{ delay: 240 }}>
			{#if owned}
				{#if !data.signedIn}
					<Alert variant="info">
						Your account is ready. Sign in with the password you chose at checkout. If you have
						forgotten it, use the link below.
					</Alert>
					<a href="/auth/sign-in?redirectTo=%2Flibrary" class="btn-primary btn-lg group w-full">
						Sign in to your account
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
					<a href="/auth/forgot-password" class="btn-secondary btn-lg w-full">
						Forgot your password?
					</a>
				{:else}
					<a href="/library" class="btn-primary btn-lg group w-full">
						Go to your library
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
					<a href="/catalogue" class="btn-secondary btn-lg w-full">Browse the catalogue</a>
				{/if}
			{:else if !finalising}
				<a href="/cart" class="btn-primary btn-lg group w-full">
					Back to your cart
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
							<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
						</svg>
					</span>
				</a>
			{/if}
		</div>

		{#if owned}
			<div class="shell mt-14 shadow-ambient" use:reveal={{ delay: 300 }}>
				<div class="core p-8 text-left sm:p-9">
					<h2 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">What's next</h2>
					<ol class="mt-6 space-y-4">
						{#each steps as step, index (step)}
							<li class="flex gap-4 text-[15px] leading-relaxed text-charcoal-600">
								<span
									class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ivory-100 font-serif text-[13px] text-charcoal-700"
								>
									{index + 1}
								</span>
								{step}
							</li>
						{/each}
					</ol>
				</div>
			</div>
		{/if}

		<p class="mt-9 text-[13px] leading-relaxed text-charcoal-500">
			{#if data.paid}
				A confirmation email is on its way.
			{/if}
			Any questions,
			<a href="/contact" class="link">get in touch</a>.
		</p>
	</div>
</section>
