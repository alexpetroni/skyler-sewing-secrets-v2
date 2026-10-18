<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import Seo from '#lib/components/Seo.svelte';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { socialLinks } from '#lib/components/layout/social-links.ts';
	import { Alert, Input, Textarea } from '#lib/components/ui/index.ts';
	import { reveal } from '#lib/actions/reveal.ts';
	import { HONEYPOT_FIELD } from '#lib/shared/schemas/marketing.ts';
	import type { PageProps } from './$types';

	interface TurnstileApi {
		reset(widget?: HTMLElement): void;
	}

	let { form }: PageProps = $props();
	let errors = $derived(form && 'errors' in form ? form.errors : undefined);
	let values = $derived(form && 'values' in form ? form.values : undefined);

	// The widget is shown only when a site key is configured; the action verifies the token.
	const turnstileSiteKey = PUBLIC_TURNSTILE_SITE_KEY || null;
	let turnstileWidget = $state<HTMLElement>();
</script>

<Seo
	title="Contact Us - Skyler's Sewing Secrets"
	description="Get in touch with Skyler. We'd love to hear from you about the course, collaborations, or any questions you may have."
/>

<svelte:head>
	{#if turnstileSiteKey}
		<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
	{/if}
</svelte:head>

<PageHeader
	eyebrow="Say hello"
	title="Get in touch"
	lede="Have a question about the course, or just want to say hello? Reach out using the details below — messages are read by Skyler, not a support queue."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="grid gap-5 lg:grid-cols-3">
		<div class="shell shadow-ambient lg:col-span-2" use:reveal>
			<div class="core h-full p-8 sm:p-10">
				<span class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Email</span>
				<a
					href="mailto:skylersewingsecrets@gmail.com"
					class="mt-4 block font-serif text-[1.75rem] leading-tight break-words text-charcoal-900 transition-colors duration-400 ease-fluid hover:text-brand-700 sm:text-[2.25rem]"
				>
					skylersewingsecrets@gmail.com
				</a>
				<p class="mt-6 max-w-reading text-[15px] leading-relaxed text-charcoal-600">
					Questions about a technique, the modules, or your access — all welcome. I typically
					respond within one to two business days.
				</p>

				<div class="mt-10 border-t border-charcoal-900/[0.07] pt-8">
					{#if form?.success}
						<Alert variant="success" title="Message sent">
							Thank you for reaching out. I'll get back to you as soon as I can.
						</Alert>
					{:else}
						{#if form && 'error' in form}
							<div class="mb-6">
								<Alert variant="error">{form.error}</Alert>
							</div>
						{/if}

						<form
							method="POST"
							use:enhance={() =>
								async ({ update }) => {
									await update();
									// A Turnstile token is single-use: issue a fresh one for a retry.
									const turnstile = (window as { turnstile?: TurnstileApi }).turnstile;
									if (turnstileWidget) turnstile?.reset(turnstileWidget);
								}}
							class="space-y-5"
						>
							<Input
								label="Name"
								name="name"
								autocomplete="name"
								required
								value={values?.name ?? ''}
								error={errors?.name}
							/>
							<Input
								label="Email address"
								name="email"
								type="email"
								autocomplete="email"
								required
								value={values?.email ?? ''}
								error={errors?.email}
							/>
							<Input
								label="Subject"
								name="subject"
								value={values?.subject ?? ''}
								error={errors?.subject}
							/>
							<Textarea
								label="Message"
								name="message"
								rows={6}
								required
								value={values?.message ?? ''}
								error={errors?.message}
							/>
							<!-- Honeypot: hidden from people and assistive tech; bots fill it in. -->
							<div class="sr-only" aria-hidden="true">
								<label for="contact-{HONEYPOT_FIELD}">Website</label>
								<input
									id="contact-{HONEYPOT_FIELD}"
									name={HONEYPOT_FIELD}
									tabindex="-1"
									autocomplete="off"
								/>
							</div>
							{#if turnstileSiteKey}
								<!-- Rendered by the Turnstile script; posts its token as cf-turnstile-response. -->
								<div
									bind:this={turnstileWidget}
									class="cf-turnstile"
									data-sitekey={turnstileSiteKey}
								></div>
							{/if}
							<button type="submit" class="btn-primary">Send message</button>
						</form>
					{/if}
				</div>
			</div>
		</div>

		<div class="grid content-start gap-5" use:reveal={{ delay: 100 }}>
			<div class="shell-sage shadow-ambient">
				<div class="core h-full p-7 sm:p-8">
					<span class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Response time</span
					>
					<p class="mt-3 font-serif text-[1.5rem] leading-none text-charcoal-900">1–2 days</p>
					<p class="mt-3 text-[14px] leading-relaxed text-charcoal-600">
						Business days, and always a real reply.
					</p>
				</div>
			</div>

			<div class="shell shadow-ambient">
				<div class="core h-full p-7 sm:p-8">
					<span class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Elsewhere</span>
					<div class="mt-4 flex flex-wrap gap-2">
						{#each socialLinks as link (link.href)}
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex h-11 w-11 items-center justify-center rounded-full text-charcoal-500 ring-1 ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid ring-inset hover:-translate-y-0.5 hover:bg-charcoal-900/[0.04] hover:text-charcoal-900"
							>
								<span class="sr-only">{link.name}</span>
								<svg
									class="h-[18px] w-[18px]"
									fill="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- inline SVG path constants from social-links.ts -->
									{@html link.icon}
								</svg>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<div
		class="mt-16 flex flex-wrap items-center justify-between gap-6 rounded-shell bg-ivory-100 px-8 py-8 ring-1 ring-charcoal-900/[0.06] ring-inset sm:px-10"
		use:reveal
	>
		<div>
			<h2 class="subsection-heading">Looking for a quick answer?</h2>
			<p class="mt-2 text-[15px] text-charcoal-600">
				Most questions about access, devices and refunds are already answered.
			</p>
		</div>
		<a href="/faq" class="btn-secondary group shrink-0">
			Read the FAQ
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
	</div>
</section>
