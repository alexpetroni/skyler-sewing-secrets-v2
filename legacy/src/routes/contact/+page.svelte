<script lang="ts">
	import { socialLinks } from '$lib/data/social-links';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import { reveal } from '$lib/actions/reveal';
</script>

<svelte:head>
	<title>Contact Us - Skyler's Sewing Secrets</title>
	<meta name="description" content="Get in touch with Skyler. We'd love to hear from you about the course, collaborations, or any questions you may have." />
	<meta property="og:title" content="Contact Us - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Get in touch with Skyler. We'd love to hear from you about the course, collaborations, or any questions you may have." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/contact" />
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
				<span class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Email</span>
				<a
					href="mailto:skylersewingsecrets@gmail.com"
					class="mt-4 block break-words font-serif text-[1.75rem] leading-tight text-charcoal-900 transition-colors duration-400 ease-fluid hover:text-brand-700 sm:text-[2.25rem]"
				>
					skylersewingsecrets@gmail.com
				</a>
				<p class="mt-6 max-w-reading text-[15px] leading-relaxed text-charcoal-600">
					Questions about a technique, the modules, or your access — all welcome. I typically respond
					within one to two business days.
				</p>
			</div>
		</div>

		<div class="grid gap-5" use:reveal={{ delay: 100 }}>
			<div class="shell-sage shadow-ambient">
				<div class="core h-full p-7 sm:p-8">
					<span class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Response time</span>
					<p class="mt-3 font-serif text-[1.5rem] leading-none text-charcoal-900">1–2 days</p>
					<p class="mt-3 text-[14px] leading-relaxed text-charcoal-600">
						Business days, and always a real reply.
					</p>
				</div>
			</div>

			<div class="shell shadow-ambient">
				<div class="core h-full p-7 sm:p-8">
					<span class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Elsewhere</span>
					<div class="mt-4 flex flex-wrap gap-2">
						{#each socialLinks as link}
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex h-11 w-11 items-center justify-center rounded-full text-charcoal-500 ring-1 ring-inset ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid hover:-translate-y-0.5 hover:bg-charcoal-900/[0.04] hover:text-charcoal-900"
							>
								<span class="sr-only">{link.name}</span>
								<svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
									{@html link.icon}
								</svg>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-16 flex flex-wrap items-center justify-between gap-6 rounded-shell bg-ivory-100 px-8 py-8 ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-10" use:reveal>
		<div>
			<h2 class="subsection-heading">Looking for a quick answer?</h2>
			<p class="mt-2 text-[15px] text-charcoal-600">
				Most questions about access, devices and refunds are already answered.
			</p>
		</div>
		<a href="/faq" class="btn-secondary group shrink-0">
			Read the FAQ
			<span class="btn-orb" aria-hidden="true">
				<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
				</svg>
			</span>
		</a>
	</div>
</section>
