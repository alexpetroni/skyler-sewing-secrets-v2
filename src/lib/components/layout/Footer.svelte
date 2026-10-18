<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base
	   path, as in legacy; most targets are routes added by later phases, which typed resolve()
	   rejects. */
	import OptimizedImage from '#lib/components/ui/OptimizedImage.svelte';
	import { socialLinks } from '#lib/components/layout/social-links.ts';
	import { reveal } from '#lib/actions/reveal.ts';

	const currentYear = new Date().getFullYear();

	const navigation = {
		learn: [
			{ name: 'Modules', href: '/modules' },
			{ name: 'Fabric Library', href: '/fabric-library' },
			{ name: 'Journal', href: '/blog' },
			{ name: 'Testimonials', href: '/testimonials' }
		],
		company: [
			{ name: 'About the course', href: '/about' },
			{ name: 'Contact', href: '/contact' },
			{ name: 'FAQ', href: '/faq' }
		],
		legal: [
			{ name: 'Privacy policy', href: '/legal/privacy' },
			{ name: 'Terms & conditions', href: '/legal/terms-and-conditions' },
			{ name: 'Claims', href: '/legal/claims' }
		]
	};
</script>

<footer class="relative isolate overflow-hidden bg-charcoal-950" aria-labelledby="footer-heading">
	<h2 id="footer-heading" class="sr-only">Footer</h2>

	<!-- Warm light pooling at the seam, so the dark ground never reads as a slab. -->
	<div
		class="aurora -top-40 left-1/4 h-[28rem] w-[28rem] animate-breathe bg-brand-800/20"
		aria-hidden="true"
	></div>
	<div
		class="aurora right-0 -bottom-52 h-[32rem] w-[32rem] bg-sage-800/20"
		aria-hidden="true"
	></div>

	<div class="container-default relative pt-24 pb-10 sm:pt-32 lg:pt-40">
		<div class="grid gap-16 lg:grid-cols-12 lg:gap-12">
			<div class="lg:col-span-5" use:reveal>
				<OptimizedImage
					class="h-auto w-full max-w-[190px]"
					src="/logo/logo-white.png"
					alt="Skyler's Sewing Secrets"
					width={300}
				/>
				<p class="mt-8 max-w-sm font-serif text-[1.75rem] leading-[1.2] text-ivory-100">
					Take your time. The techniques keep.
				</p>
				<p class="mt-5 max-w-sm text-[15px] leading-relaxed text-charcoal-400">
					Professional sewing methods, taught slowly and in order — from the first straight seam to
					couture finishing. Yours for life, revisited whenever you need them.
				</p>
			</div>

			<div class="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7" use:reveal={{ delay: 120 }}>
				<div>
					<h3 class="text-[10px] font-semibold tracking-eyebrow text-charcoal-500 uppercase">
						Learn
					</h3>
					<ul class="mt-6 space-y-3.5">
						{#each navigation.learn as item (item.href)}
							<li>
								<a
									href={item.href}
									class="text-[14px] text-charcoal-300 transition-colors duration-400 ease-fluid hover:text-ivory-50"
								>
									{item.name}
								</a>
							</li>
						{/each}
					</ul>
				</div>
				<div>
					<h3 class="text-[10px] font-semibold tracking-eyebrow text-charcoal-500 uppercase">
						Course
					</h3>
					<ul class="mt-6 space-y-3.5">
						{#each navigation.company as item (item.href)}
							<li>
								<a
									href={item.href}
									class="text-[14px] text-charcoal-300 transition-colors duration-400 ease-fluid hover:text-ivory-50"
								>
									{item.name}
								</a>
							</li>
						{/each}
					</ul>
				</div>
				<div class="col-span-2 sm:col-span-1">
					<h3 class="text-[10px] font-semibold tracking-eyebrow text-charcoal-500 uppercase">
						Legal
					</h3>
					<ul class="mt-6 space-y-3.5">
						{#each navigation.legal as item (item.href)}
							<li>
								<a
									href={item.href}
									class="text-[14px] text-charcoal-300 transition-colors duration-400 ease-fluid hover:text-ivory-50"
								>
									{item.name}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>

		<div
			class="mt-20 flex flex-col gap-6 border-t border-white/[0.08] pt-8 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-[12px] text-charcoal-500">
				&copy; {currentYear} Skyler's Sewing Secrets. All rights reserved.
			</p>
			<div class="flex gap-2">
				{#each socialLinks as link (link.href)}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex h-10 w-10 items-center justify-center rounded-full text-charcoal-400 ring-1 ring-white/[0.08] transition-all duration-400 ease-fluid ring-inset hover:-translate-y-0.5 hover:bg-white/[0.06] hover:text-ivory-50"
						aria-label={link.name}
					>
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
</footer>
