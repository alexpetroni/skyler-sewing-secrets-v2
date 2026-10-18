<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import Seo from '#lib/components/Seo.svelte';
	import OptimizedImage from '#lib/components/ui/OptimizedImage.svelte';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { reveal } from '#lib/actions/reveal.ts';
	import { fabrics } from '#lib/data/fabric-library.ts';

	let selectedImage = $state<{ src: string; alt: string } | null>(null);

	function openLightbox(src: string, alt: string) {
		selectedImage = { src, alt };
	}

	function closeLightbox() {
		selectedImage = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && selectedImage) {
			closeLightbox();
		}
	}

	const difficultyStyles: Record<string, string> = {
		Beginner: 'bg-sage-100 text-sage-700 ring-sage-700/12',
		Intermediate: 'bg-gold-400/15 text-gold-700 ring-gold-600/20',
		Advanced: 'bg-brand-100/70 text-brand-800 ring-brand-700/15'
	};

	function difficultyClass(difficulty: string): string {
		return (
			difficultyStyles[difficulty] ??
			'bg-charcoal-900/[0.04] text-charcoal-600 ring-charcoal-900/[0.07]'
		);
	}
</script>

<Seo
	title="Fabric Library - Skyler's Sewing Secrets"
	description="Explore our comprehensive fabric guide with expert tips on working with cotton, silk, jersey, lace, and more. Learn professional techniques for each fabric type."
	image="https://skyler-storage.b-cdn.net/images/fabrics/silk-satin.jpg"
/>

<svelte:window onkeydown={handleKeydown} />

<PageHeader
	eyebrow="Reference"
	title="Fabric library"
	lede="Understanding fabric is most of the work. This is my own guide to handling each one — the needles, the seams and the habits learned over years of professional dressmaking."
/>

<!-- Jump list: this page is long, so the index sits above the fold. -->
<nav class="container-default pb-16" aria-label="Fabrics">
	<div class="flex flex-wrap gap-2">
		{#each fabrics as fabric (fabric.slug)}
			<a
				href="#{fabric.slug}"
				class="inline-flex items-center rounded-full bg-white/70 px-4 py-2 text-[13px] font-medium text-charcoal-600 ring-1 ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid ring-inset hover:-translate-y-0.5 hover:bg-white hover:text-charcoal-900 hover:shadow-ambient"
			>
				{fabric.name}
			</a>
		{/each}
	</div>
</nav>

<section class="container-default pb-24 sm:pb-32">
	<div class="space-y-6">
		{#each fabrics as fabric, index (fabric.slug)}
			<article id={fabric.slug} class="shell-lg scroll-mt-32 shadow-ambient" use:reveal>
				<div class="grid items-stretch overflow-hidden rounded-core-lg bg-white lg:grid-cols-12">
					<!-- Swatch plate; sides alternate so the eye keeps moving down the page. -->
					<div class="lg:col-span-5 {index % 2 === 1 ? 'lg:order-2' : ''}">
						<button
							type="button"
							onclick={() => openLightbox(fabric.image, fabric.name)}
							class="group flex h-full w-full cursor-zoom-in items-center justify-center overflow-hidden bg-ivory-100 p-4"
							aria-label="View {fabric.name} image"
						>
							<OptimizedImage
								src={fabric.image}
								alt={fabric.name}
								width={700}
								sizes="(min-width: 1024px) 40vw, 100vw"
								class="max-h-[26rem] w-full rounded-core object-contain transition-transform duration-1000 ease-fluid group-hover:scale-[1.02]"
							/>
						</button>
					</div>

					<div class="p-8 sm:p-10 lg:col-span-7">
						<div class="flex flex-wrap items-center gap-3">
							<h2 class="section-heading">{fabric.name}</h2>
							<span
								class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium tracking-wide ring-1 ring-inset {difficultyClass(
									fabric.difficulty
								)}"
							>
								{fabric.difficulty}
							</span>
						</div>

						<p
							class="mt-3 inline-flex items-center gap-2 text-[12px] tracking-eyebrow text-charcoal-400 uppercase"
						>
							<svg
								class="h-3.5 w-3.5"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.15"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path
									d="M8 2.5v11M4.25 4.25 2.5 10.5a1.75 1.75 0 0 0 3.5 0L4.25 4.25ZM11.75 4.25 10 10.5a1.75 1.75 0 0 0 3.5 0l-1.75-6.25Z"
								/>
							</svg>
							{fabric.weight}
						</p>

						<p class="mt-6 max-w-reading text-[16px] leading-[1.75] text-charcoal-600">
							{fabric.description}
						</p>

						<div
							class="mt-7 rounded-2xl bg-ivory-100 p-6 ring-1 ring-charcoal-900/[0.05] ring-inset"
						>
							<h3 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
								Skyler's tips
							</h3>
							<p class="mt-4 text-[15px] leading-[1.75] text-charcoal-600">{fabric.tips}</p>
							{#if fabric.pro_tip}
								<p
									class="mt-5 border-t border-charcoal-900/[0.07] pt-5 text-[15px] leading-relaxed text-charcoal-700"
								>
									<span class="font-semibold">Pro tip:</span>
									{fabric.pro_tip}
								</p>
							{/if}
						</div>

						<div class="mt-7">
							<h3 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
								Recommended techniques
							</h3>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each fabric.recommended_techniques as technique (technique)}
									<span
										class="inline-flex items-center rounded-full bg-sage-100/70 px-3 py-1 text-[12px] font-medium text-sage-700 ring-1 ring-sage-700/10 ring-inset"
									>
										{technique}
									</span>
								{/each}
							</div>
						</div>
					</div>
				</div>
			</article>
		{/each}
	</div>

	<div
		class="mt-16 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-charcoal-900/[0.06] ring-inset sm:px-12 sm:py-16"
		use:reveal
	>
		<h2 class="section-title text-balance">Master these fabrics in the course</h2>
		<p class="section-description mx-auto mt-5 max-w-xl">
			Every technique here is filmed in full — see it done, then follow along at your own pace.
		</p>
		<a href="/catalogue" class="btn-primary btn-lg group mt-9">
			Start learning today
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
	</div>
</section>

<!-- Lightbox -->
{#if selectedImage}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
		aria-label={selectedImage.alt}
	>
		<button
			type="button"
			class="absolute inset-0 cursor-zoom-out bg-ivory-50/90 backdrop-blur-2xl"
			onclick={closeLightbox}
			aria-label="Close image"
		></button>

		<button
			type="button"
			class="absolute top-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-charcoal-600 shadow-ambient ring-1 ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid ring-inset hover:text-charcoal-900 active:scale-95"
			onclick={closeLightbox}
		>
			<span class="sr-only">Close image</span>
			<svg
				class="h-4 w-4"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.25"
				stroke-linecap="round"
			>
				<path d="m4 4 8 8M12 4l-8 8" />
			</svg>
		</button>

		<div
			class="pointer-events-none relative flex max-h-[92dvh] w-full max-w-4xl animate-drift-in items-center justify-center p-5"
		>
			<OptimizedImage
				src={selectedImage.src}
				alt={selectedImage.alt}
				width={1600}
				sizes="100vw"
				class="max-h-[86dvh] w-auto max-w-full rounded-core-lg object-contain shadow-float"
			/>
		</div>
	</div>
{/if}
