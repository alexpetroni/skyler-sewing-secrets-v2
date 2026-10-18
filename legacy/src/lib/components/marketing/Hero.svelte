<script lang="ts">
	import { onMount } from 'svelte';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	interface Slide {
		src: string;
		alt: string;
		videoUrl?: string;
	}

	const slides: Slide[] = [
		{ src: '/images/collage/20260128_104658.jpg', alt: 'Professional sewing technique' },
		{ src: '/images/collage/20260128_110605.jpg', alt: 'Detailed stitching work' },
		{ src: '/images/collage/20260128_112048.jpg', alt: 'Couture sewing detail' },
		{ src: '/images/collage/20260128_112535.jpg', alt: 'Fabric finishing technique' },
		{ src: '/images/collage/20260128_113327.jpg', alt: 'Sewing craftsmanship' },
		{ src: '/images/collage/20260128_114358.jpg', alt: 'Garment construction' },
		{ src: '/images/collage/20260128_120116.jpg', alt: 'Sewing artistry' }
	];

	const stats = [
		{ value: `${courseOverview.totals.modules + courseOverview.totals.bonus_modules}`, label: 'Modules' },
		{ value: `${courseOverview.totals.videos}`, label: 'Video tutorials' },
		{ value: '4½ hrs', label: 'Of teaching' },
		{ value: 'Lifetime', label: 'Access' }
	];

	let currentSlide = $state(0);
	let interval: ReturnType<typeof setInterval>;
	let showVideoModal = $state(false);
	let currentVideoUrl = $state('');

	onMount(() => {
		startInterval();
		return () => clearInterval(interval);
	});

	function startInterval() {
		interval = setInterval(() => {
			currentSlide = (currentSlide + 1) % slides.length;
		}, 5200);
	}

	function resetInterval() {
		clearInterval(interval);
		startInterval();
	}

	function goToSlide(index: number) {
		currentSlide = index;
		resetInterval();
	}

	function nextSlide() {
		currentSlide = (currentSlide + 1) % slides.length;
		resetInterval();
	}

	function prevSlide() {
		currentSlide = (currentSlide - 1 + slides.length) % slides.length;
		resetInterval();
	}

	function handleSlideClick(slide: Slide) {
		if (!slide.videoUrl) return;
		currentVideoUrl = slide.videoUrl;
		showVideoModal = true;
		clearInterval(interval);
	}

	function closeVideoModal() {
		showVideoModal = false;
		currentVideoUrl = '';
		resetInterval();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showVideoModal) closeVideoModal();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="relative isolate overflow-hidden">
	<!-- Light pooled behind the type, never a flat wash of colour. -->
	<div class="aurora -top-32 left-[-10%] h-[34rem] w-[34rem] bg-brand-200/40 animate-breathe" aria-hidden="true"></div>
	<div class="aurora bottom-[-14rem] right-[-8%] h-[38rem] w-[38rem] bg-sage-200/40" aria-hidden="true"></div>

	<div class="container-default pb-20 pt-14 sm:pb-28 sm:pt-20 lg:pb-32 lg:pt-24">
		<div class="grid items-center gap-16 lg:grid-cols-12 lg:gap-12">
			<!-- Editorial column -->
			<div class="lg:col-span-7 xl:col-span-6">
				<span class="eyebrow" use:reveal>
					<span class="h-1 w-1 rounded-full bg-gold-400"></span>
					Couture technique, taught slowly
				</span>

				<h1 class="display mt-7 text-balance" use:reveal={{ delay: 80 }}>
					Welcome to Skyler's
					<span class="italic text-brand-700">Sewing Secrets</span>
				</h1>

				<p class="mt-7 max-w-xl font-serif text-[1.375rem] italic leading-snug text-charcoal-500 sm:text-[1.5rem]" use:reveal={{ delay: 160 }}>
					Where craftsmanship, creativity and couture-level finishing come to life.
				</p>

				<p class="mt-8 max-w-reading text-pretty text-[17px] leading-[1.75] text-charcoal-600" use:reveal={{ delay: 220 }}>
					Skyler's Sewing Secrets is more than just a sewing course—it's a place to slow down, focus
					on the art of how things are made, and fall in love with the details that turn ordinary
					garments into something extraordinary. Here you'll be guided through the same thoughtful
					techniques used in high-end ateliers, adapted for anyone with a domestic sewing machine and
					a passion to learn.
				</p>

				<div class="mt-11 flex flex-wrap items-center gap-4" use:reveal={{ delay: 280 }}>
					<a href="/checkout" class="btn-primary btn-lg group">
						Enrol now — lifetime access
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
							</svg>
						</span>
					</a>
					<a href="/modules" class="btn-ghost btn-lg group">
						Browse the modules
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</a>
				</div>

				<dl class="mt-14 grid max-w-lg grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4" use:reveal={{ delay: 340 }}>
					{#each stats as stat}
						<div class="border-l border-charcoal-900/[0.09] pl-4">
							<dt class="font-serif text-[1.75rem] leading-none text-charcoal-900">{stat.value}</dt>
							<dd class="mt-2 text-[11px] uppercase tracking-eyebrow text-charcoal-400">{stat.label}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<!-- Portrait plate: a photo seated in a tray, tilted just off the grid. -->
			<div class="lg:col-span-5 xl:col-span-6" use:reveal={{ delay: 120 }}>
				<div class="relative mx-auto w-full max-w-sm lg:max-w-md">
					<div
						class="shell-lg shadow-float transition-transform duration-1000 ease-fluid md:-rotate-2 md:hover:rotate-0"
					>
						<div class="core-lg relative aspect-[9/16] overflow-hidden">
							{#each slides as slide, index}
								<button
									type="button"
									class="absolute inset-0 h-full w-full border-0 bg-transparent p-0 transition-opacity duration-1000 ease-soft {slide.videoUrl
										? 'cursor-pointer'
										: 'cursor-default'} {currentSlide === index
										? 'opacity-100'
										: 'pointer-events-none opacity-0'}"
									onclick={() => handleSlideClick(slide)}
									aria-label={slide.videoUrl ? `Play video: ${slide.alt}` : slide.alt}
									tabindex={currentSlide === index ? 0 : -1}
								>
									<OptimizedImage
										class="h-full w-full object-cover"
										src={slide.src}
										alt={slide.alt}
										width={600}
										sizes="(max-width: 640px) 22rem, (max-width: 1024px) 24rem, 28rem"
										loading={index === 0 ? 'eager' : 'lazy'}
									/>
									{#if slide.videoUrl}
										<span class="absolute inset-0 flex items-center justify-center">
											<span class="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-50/90 shadow-lift backdrop-blur-sm transition-transform duration-400 ease-spring hover:scale-105">
												<svg class="ml-0.5 h-6 w-6 text-charcoal-900" viewBox="0 0 24 24" fill="currentColor">
													<path d="M8 5v14l11-7z" />
												</svg>
											</span>
										</span>
									{/if}
								</button>
							{/each}

							<!-- Controls float on the glass, never bolted to the frame. -->
							<div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4">
								<button
									type="button"
									onclick={prevSlide}
									class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-ivory-50/85 text-charcoal-700 shadow-ambient backdrop-blur-md transition-all duration-400 ease-fluid hover:bg-ivory-50 active:scale-95"
									aria-label="Previous image"
								>
									<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
										<path d="M10 3.5 5.5 8l4.5 4.5" />
									</svg>
								</button>

								<div class="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ivory-50/85 px-3 py-2 shadow-ambient backdrop-blur-md">
									{#each slides as _, index}
										<button
											type="button"
											onclick={() => goToSlide(index)}
											class="h-1.5 rounded-full transition-all duration-600 ease-fluid {currentSlide === index
												? 'w-5 bg-charcoal-800'
												: 'w-1.5 bg-charcoal-900/25 hover:bg-charcoal-900/45'}"
											aria-label="Go to image {index + 1}"
										></button>
									{/each}
								</div>

								<button
									type="button"
									onclick={nextSlide}
									class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-ivory-50/85 text-charcoal-700 shadow-ambient backdrop-blur-md transition-all duration-400 ease-fluid hover:bg-ivory-50 active:scale-95"
									aria-label="Next image"
								>
									<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
										<path d="m6 3.5 4.5 4.5L6 12.5" />
									</svg>
								</button>
							</div>
						</div>
					</div>

					<!-- Overlapping caption chip, removed on touch layouts to keep targets clean. -->
					<div class="pointer-events-none absolute -left-6 bottom-16 hidden rounded-2xl bg-ivory-50/90 px-4 py-3 shadow-lift ring-1 ring-inset ring-charcoal-900/[0.06] backdrop-blur-md lg:block">
						<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">From the atelier</p>
						<p class="mt-1 font-serif text-lg leading-none text-charcoal-900">40+ years of craft</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Manifesto band: the remaining hero copy, given room to be read. -->
<section class="section-alt border-y border-charcoal-900/[0.06]">
	<div class="container-default py-20 sm:py-24">
		<div class="grid gap-10 lg:grid-cols-12 lg:gap-16">
			<h2 class="font-serif text-[1.75rem] leading-tight text-charcoal-900 lg:col-span-5 lg:text-[2.25rem]" use:reveal>
				And by the end, you won't just be a better sewer — you'll be an
				<span class="italic text-brand-700">artist of the finishings.</span>
			</h2>
			<div class="space-y-6 lg:col-span-7" use:reveal={{ delay: 120 }}>
				<p class="max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600">
					You'll discover how powerful it feels to finish a seam beautifully, to shape a garment with
					intention, and to sew with the kind of care that shows both inside and out. This is your
					space to grow, to create, and to connect deeply with your craft.
				</p>
				<p class="max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600">
					Every technique is filmed close to the hands, in the order you'd actually meet it at the
					machine — so nothing is rushed, and nothing is assumed.
				</p>
			</div>
		</div>
	</div>
</section>

{#if showVideoModal}
	<div class="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Video">
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-charcoal-950/85 backdrop-blur-xl"
			onclick={closeVideoModal}
			aria-label="Close video"
		></button>
		<button
			type="button"
			class="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-all duration-400 ease-fluid hover:bg-white/20 active:scale-95"
			onclick={closeVideoModal}
		>
			<span class="sr-only">Close video</span>
			<svg class="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
				<path d="m4 4 8 8M12 4l-8 8" />
			</svg>
		</button>
		<div class="relative mx-4 w-full max-w-sm animate-drift-in">
			<video class="w-full rounded-3xl shadow-float" src={currentVideoUrl} controls autoplay playsinline>
				<track kind="captions" />
			</video>
		</div>
	</div>
{/if}
