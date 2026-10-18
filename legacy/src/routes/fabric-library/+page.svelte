<script lang="ts">
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Fabric {
		name: string;
		slug: string;
		image: string;
		weight: string;
		difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
		description: string;
		tips: string;
		pro_tip?: string;
		recommended_techniques: string[];
	}

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

	const fabrics: Fabric[] = [
		{
			name: 'Cotton',
			slug: 'cotton',
			image: '/images/fabrics/cotton.jpg',
			weight: 'Light to Medium',
			difficulty: 'Beginner',
			description: "Cotton is a fantastic fabric to sew with, making it perfect for beginners! It's easy to work with and can be used for a variety of garments, including dresses, skirts, and even jackets.",
			tips: 'For the best results, I recommend using flat-felled seam for shirts or sporty dresses to give them a clean, durable finish. Alternatively, an overlock stitch or a wider French seam is a great way to neatly finish seam allowances. Topstitches can add strength and style.',
			recommended_techniques: ['Flat-felled seam', 'French seam', 'Overlock stitch', 'Topstitching']
		},
		{
			name: 'Jersey',
			slug: 'jersey',
			image: '/images/fabrics/jersey.jpg',
			weight: 'Light to Medium',
			difficulty: 'Intermediate',
			description: "Jersey is a beautifully draping fabric, making it a great choice for comfortable garments. Even Coco Chanel embraced jersey for her iconic dresses - proof of its timeless appeal!",
			tips: 'Finding the perfect machine needle can be a challenge. I find that stretch needles or ballpoint needles in size 70/10 or 75/11 work best, especially for delicate silk jerseys. Using the right needle is essential to prevent damage to the knit. For stitching, zig-zag, overlock or babylock with specialised threads ensure flexibility and durability. To help garments maintain their shape, fine silicone elastic is a great addition to shoulders, neckline or armhole seam allowances.',
			recommended_techniques: ['Zig-zag stitch', 'Overlock', 'Babylock', 'Silicone elastic reinforcement']
		},
		{
			name: 'Silk Satin',
			slug: 'silk-satin',
			image: '/images/fabrics/silk-satin.jpg',
			weight: 'Light',
			difficulty: 'Advanced',
			description: 'Silk satin has been a symbol of luxury and glamour since the days of the Silk Road. Its rich sheen and fluid drape make it a favorite for high-end fashion, but working with it requires precision.',
			tips: 'To maintain accuracy while cutting, placing the silk on paper helps prevent shifting. Staystitching on lightweight paper further ensures the fabric retains its shape. For sewing, Microtex or Sharps needles in sizes 60/8 or 70/10 are ideal, as they glide through the delicate fibers without causing damage. Always use sharp scissors and avoid damaged needles to preserve the fabric integrity. For flawless finish, French seams and pin hems are the perfect choices, giving your garments a couture-quality touch with elegant drape and movement - worthy of the red carpet!',
			recommended_techniques: ['French seam', 'Pin hem', 'Staystitching on paper', 'Microtex needles']
		},
		{
			name: 'Organza',
			slug: 'organza',
			image: '/images/fabrics/organza.jpg',
			weight: 'Light',
			difficulty: 'Advanced',
			description: 'There are three types of organza: single - very sheer, double - medium weight, and triple - a more opaque version. Organza is another unpredictable fabric with a crisp, rice-paper-like texture with no natural drape.',
			tips: "Like other delicate, silky materials, I prefer to stitch it on paper and use a sharp, brand-new sewing machine needle to prevent damage to its fine fibers. When sewing, I rely on French seams, pin hems, or even flat felled seams for a clean finish. Organza demands precision - any sloppy work looks noticeably cheap. Beyond garment construction, organza is also used as an interlining in couture sewing, providing structure where fusible interlining isn't an option.",
			recommended_techniques: ['French seam', 'Pin hem', 'Flat felled seam', 'Stitch on paper']
		},
		{
			name: 'Velvet',
			slug: 'velvet',
			image: '/images/fabrics/velvet.jpg',
			weight: 'Medium',
			difficulty: 'Advanced',
			description: 'Velvet can be very challenging to work with due to its pile and luxurious texture. This sumptuous fabric requires special handling to achieve professional results.',
			tips: 'Cut each panel on a single layer, ensuring all pieces follow the same grain - especially the bias cuts - to keep the pile aligned in one direction. When sewing two layers together, pin diagonally to prevent shifting while sewing, and stitch in the direction of the pile. Steam rather than press, placing a towel underneath to avoid crushing the pile. Instead of finishing seam allowances, I prefer to line the velvet for a cleaner, more refined look.',
			recommended_techniques: ['Single layer cutting', 'Diagonal pinning', 'Steam pressing', 'Lining']
		},
		{
			name: 'Sequins',
			slug: 'sequins',
			image: '/images/fabrics/sequin.jpg',
			weight: 'Medium',
			difficulty: 'Advanced',
			description: 'Sequins require patience - but the result is worth it. This glamorous fabric can create spectacular, red-carpet-worthy pieces when handled with care.',
			tips: "When cutting, use separate scissors, as sequins can quickly dull the blades. Cut each pattern piece on a single layer, with the right side facing up, to follow the grain of the sequins accurately. Use sharp needles and sew slowly, only when you're certain of the final stitching, as needle holes will be visible permanently in the sequins. Test your fabric first. If the sequins are small, you may be able to stitch through them; otherwise, you'll need to remove or break them. Be careful not to cut the thread, as sequins are typically sewn on with a chain stitch. Avoid using a hot iron, as sequins can melt, shrink or change color. For finishing the inside, seam allowances can be bound with bias tape, Hong Kong binding, or simply by lining the garment.",
			recommended_techniques: ['Single layer cutting', 'Bias tape binding', 'Hong Kong binding', 'Lining']
		},
		{
			name: 'Lace',
			slug: 'lace',
			image: '/images/fabrics/lace.jpg',
			weight: 'Light',
			difficulty: 'Advanced',
			description: "Lace is the most romantic fabric... Whether used for evening gowns, wedding dresses, or delicate appliques, lace always evokes sensual femininity. J'adore!",
			tips: "I recommend cutting each panel separately on paper, carefully following the lace's direction. Use sharp, fine needles and opt for French seams or bind the seam allowances with tulle, using the Hong Kong binding method for a flawless finish.",
			recommended_techniques: ['French seam', 'Hong Kong binding with tulle', 'Cut on paper', 'Fine needles']
		},
		{
			name: 'Wool',
			slug: 'wool',
			image: '/images/fabrics/tweed.jpg',
			weight: 'Medium to Heavy',
			difficulty: 'Intermediate',
			description: 'Wool is another timeless and truly remarkable fabric. Wool crepe drapes beautifully, pleats perfectly and holds its shape wonderfully.',
			tips: "For a sophisticated, luxurious feel, I recommend lining it with crepe de chine, because this elegant, high-end fabric deserves nothing less. However, if you choose not to, you can always overlock or bind the seam allowances for a clean finish. Wool really thrives with hand-stitching techniques, so don't be afraid to get creative and add your personal touch. Be bold and let your craftsmanship shine to make your garment unique.",
			recommended_techniques: ['Hand-stitching', 'Crepe de chine lining', 'Overlock', 'Binding']
		},
		{
			name: 'Georgette',
			slug: 'georgette',
			image: '/images/fabrics/georgette.jpg',
			weight: 'Light',
			difficulty: 'Advanced',
			description: "If there is one fabric that embodies elegance and movement, it's georgette. This dreamy textile flutters at the slightest breath of air, making it a delight to wear but a challenge to cut.",
			tips: "To keep it from shifting, always stabilize it on lightweight paper with pins before cutting. And for absolute precision, cut each panel individually - this ensures you stay on grain. When it comes to stitching, handle georgette with maximum care. Use the finest machine needle, because once damaged, this delicate beauty doesn't forgive. For a couture-worthy look, use French seams, pin hems or self-binding with georgette or organza. The result? A garment that drapes like a dream, flows effortlessly, and takes gathers, pleats and pintucks like a pro - truly one of the most versatile fabrics out there! Trust me, once you master georgette, there's no going back!",
			pro_tip: 'Always keep a skin-nude silk georgette in your stash for base, bindings, facings and many more.',
			recommended_techniques: ['French seam', 'Pin hem', 'Self-binding', 'Stitch on paper']
		},
		{
			name: 'Tulle',
			slug: 'tulle',
			image: '/images/fabrics/tulle.jpg',
			weight: 'Very Light',
			difficulty: 'Intermediate',
			description: "Let's get one thing straight - tulle is NOT a mesh! This sheer, magical fabric is my go-to for adding structure without weight.",
			tips: "Tulle is perfect for creating illusion necklines, deep V cutouts, or providing invisible support in gowns. It's the secret weapon for reinforcing fabric under zippers, binding delicate lace, or even acting as an interlining for organza and other sheer textiles. When working with tulle, cut it carefully and staystitch it on paper to keep it from shifting and stretching - you don't want snags ruining your masterpiece! Unless you're working with silk tulle, keep the iron at bay, or risk irreversible meltdown (literally).",
			recommended_techniques: ['Staystitching on paper', 'No heat pressing', 'Binding', 'Interlining']
		},
		{
			name: 'Chiffon',
			slug: 'chiffon',
			image: '/images/fabrics/chiffon.jpg',
			weight: 'Very Light',
			difficulty: 'Advanced',
			description: 'Chiffon is an ethereal, gossamer-like fabric that creates stunning, flowing garments. Its sheer quality and delicate nature make it a favorite for romantic and formal designs.',
			tips: 'Like georgette, chiffon requires careful handling. Stabilize on paper before cutting and use sharp, fine needles. French seams are essential for a clean finish as raw edges will be visible. Consider using silk thread for the most invisible seams.',
			recommended_techniques: ['French seam', 'Pin hem', 'Stitch on paper', 'Fine needles']
		}
	];

	const difficultyStyles: Record<string, string> = {
		Beginner: 'bg-sage-100 text-sage-700 ring-sage-700/12',
		Intermediate: 'bg-gold-400/15 text-gold-700 ring-gold-600/20',
		Advanced: 'bg-brand-100/70 text-brand-800 ring-brand-700/15'
	};

	function difficultyClass(difficulty: string): string {
		return difficultyStyles[difficulty] ?? 'bg-charcoal-900/[0.04] text-charcoal-600 ring-charcoal-900/[0.07]';
	}
</script>

<svelte:head>
	<title>Fabric Library - Skyler's Sewing Secrets</title>
	<meta name="description" content="Explore our comprehensive fabric guide with expert tips on working with cotton, silk, jersey, lace, and more. Learn professional techniques for each fabric type." />
	<meta property="og:title" content="Fabric Library - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Explore our comprehensive fabric guide with expert tips on working with cotton, silk, jersey, lace, and more. Learn professional techniques for each fabric type." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/fabrics/silk-satin.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/fabric-library" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<PageHeader
	eyebrow="Reference"
	title="Fabric library"
	lede="Understanding fabric is most of the work. This is my own guide to handling each one — the needles, the seams and the habits learned over years of professional dressmaking."
/>

<!-- Jump list: this page is long, so the index sits above the fold. -->
<nav class="container-default pb-16" aria-label="Fabrics">
	<div class="flex flex-wrap gap-2">
		{#each fabrics as fabric}
			<a
				href="#{fabric.slug}"
				class="inline-flex items-center rounded-full bg-white/70 px-4 py-2 text-[13px] font-medium text-charcoal-600 ring-1 ring-inset ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid hover:-translate-y-0.5 hover:bg-white hover:text-charcoal-900 hover:shadow-ambient"
			>
				{fabric.name}
			</a>
		{/each}
	</div>
</nav>

<section class="container-default pb-24 sm:pb-32">
	<div class="space-y-6">
		{#each fabrics as fabric, index}
			<article id={fabric.slug} class="scroll-mt-32 shell-lg shadow-ambient" use:reveal>
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
							<span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium tracking-wide ring-1 ring-inset {difficultyClass(fabric.difficulty)}">
								{fabric.difficulty}
							</span>
						</div>

						<p class="mt-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-eyebrow text-charcoal-400">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M8 2.5v11M4.25 4.25 2.5 10.5a1.75 1.75 0 0 0 3.5 0L4.25 4.25ZM11.75 4.25 10 10.5a1.75 1.75 0 0 0 3.5 0l-1.75-6.25Z" />
							</svg>
							{fabric.weight}
						</p>

						<p class="mt-6 max-w-reading text-[16px] leading-[1.75] text-charcoal-600">
							{fabric.description}
						</p>

						<div class="mt-7 rounded-2xl bg-ivory-100 p-6 ring-1 ring-inset ring-charcoal-900/[0.05]">
							<h3 class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Skyler's tips</h3>
							<p class="mt-4 text-[15px] leading-[1.75] text-charcoal-600">{fabric.tips}</p>
							{#if fabric.pro_tip}
								<p class="mt-5 border-t border-charcoal-900/[0.07] pt-5 text-[15px] leading-relaxed text-charcoal-700">
									<span class="font-semibold">Pro tip:</span>
									{fabric.pro_tip}
								</p>
							{/if}
						</div>

						<div class="mt-7">
							<h3 class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">
								Recommended techniques
							</h3>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each fabric.recommended_techniques as technique}
									<span class="inline-flex items-center rounded-full bg-sage-100/70 px-3 py-1 text-[12px] font-medium text-sage-700 ring-1 ring-inset ring-sage-700/10">
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

	<div class="mt-16 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-12 sm:py-16" use:reveal>
		<h2 class="section-title text-balance">Master these fabrics in the course</h2>
		<p class="section-description mx-auto mt-5 max-w-xl">
			Every technique here is filmed in full — see it done, then follow along at your own pace.
		</p>
		<a href="/checkout" class="btn-primary btn-lg group mt-9">
			Start learning today
			<span class="btn-orb" aria-hidden="true">
				<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
				</svg>
			</span>
		</a>
	</div>
</section>

<!-- Lightbox -->
{#if selectedImage}
	<div class="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={selectedImage.alt}>
		<button
			type="button"
			class="absolute inset-0 cursor-zoom-out bg-ivory-50/90 backdrop-blur-2xl"
			onclick={closeLightbox}
			aria-label="Close image"
		></button>

		<button
			type="button"
			class="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-charcoal-600 shadow-ambient ring-1 ring-inset ring-charcoal-900/[0.07] transition-all duration-400 ease-fluid hover:text-charcoal-900 active:scale-95"
			onclick={closeLightbox}
		>
			<span class="sr-only">Close image</span>
			<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
				<path d="m4 4 8 8M12 4l-8 8" />
			</svg>
		</button>

		<div class="pointer-events-none relative flex max-h-[92dvh] w-full max-w-4xl animate-drift-in items-center justify-center p-5">
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
