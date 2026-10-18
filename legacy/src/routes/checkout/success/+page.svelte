<script lang="ts">
	import type { PageData } from './$types';
	import { Alert } from '$lib/components/ui';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const steps = $derived([
		data.needsSignIn
			? 'Sign in with the password you chose at checkout'
			: 'Check your email for your welcome message and login details',
		'Visit your dashboard to track your progress',
		'Start with Module 1: Basics, to build a strong foundation',
		'Download the resources for each lesson as you progress'
	]);
</script>

<svelte:head>
	<title>Welcome! - Skyler's Sewing Secrets</title>
	<meta name="description" content="Your enrollment is complete! Welcome to Skyler's Sewing Secrets. Start learning professional sewing techniques today." />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-32 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 bg-sage-200/40 animate-breathe" aria-hidden="true"></div>

	<div class="mx-auto max-w-2xl px-5 py-24 text-center sm:py-32">
		<span class="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-sage-100 text-sage-700 shadow-ambient ring-1 ring-inset ring-sage-700/10" use:reveal>
			<svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
				<path d="m5 12.5 4.5 4.5L19 7" />
			</svg>
		</span>

		<h1 class="page-title mt-9 text-balance" use:reveal={{ delay: 60 }}>
			Welcome to Skyler's Sewing Secrets
		</h1>

		<p class="section-description mx-auto mt-6" use:reveal={{ delay: 120 }}>
			Your lifetime access has been activated. Every module, tutorial and resource is open to you —
			and stays that way.
		</p>

		<div class="mt-10 space-y-4" use:reveal={{ delay: 180 }}>
			{#if data.needsSignIn}
				<Alert variant="info">
					{#snippet children()}
						Your account is ready. Sign in with the password you chose at checkout. If you have forgotten it, use the link below.
					{/snippet}
				</Alert>

				<a href="/auth/sign-in{data.email ? `?email=${encodeURIComponent(data.email)}` : ''}" class="btn-primary btn-lg group w-full">
					Sign in to your account
					<span class="btn-orb" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
						</svg>
					</span>
				</a>
				<a href="/auth/forgot-password{data.email ? `?email=${encodeURIComponent(data.email)}` : ''}" class="btn-secondary btn-lg w-full">
					Forgot your password?
				</a>
			{:else}
				<a href="/dashboard" class="btn-primary btn-lg group w-full">
					Go to your dashboard
					<span class="btn-orb" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
						</svg>
					</span>
				</a>
				<a href="/modules" class="btn-secondary btn-lg w-full">Start learning</a>
			{/if}
		</div>

		<div class="mt-14 shell shadow-ambient" use:reveal={{ delay: 240 }}>
			<div class="core p-8 text-left sm:p-9">
				<h2 class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">What's next</h2>
				<ol class="mt-6 space-y-4">
					{#each steps as step, index}
						<li class="flex gap-4 text-[15px] leading-relaxed text-charcoal-600">
							<span class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ivory-100 font-serif text-[13px] text-charcoal-700">
								{index + 1}
							</span>
							{step}
						</li>
					{/each}
				</ol>
			</div>
		</div>

		<p class="mt-9 text-[13px] leading-relaxed text-charcoal-500">
			A confirmation email is on its way. Any questions,
			<a href="/contact" class="link">get in touch</a>.
		</p>
	</div>
</section>
