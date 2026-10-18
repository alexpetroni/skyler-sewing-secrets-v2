<script lang="ts">
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import courseOverview from '$lib/data/course-overview';
	import { reveal } from '$lib/actions/reveal';

	const pillars = [
		{
			title: `${courseOverview.totals.minutes} minutes of video (${courseOverview.totals.videos} videos)`,
			body: 'Lifetime access to step-by-step video tutorials and visual guides.',
			icon: 'M2.5 5.75A2.25 2.25 0 0 1 4.75 3.5h6.5a2.25 2.25 0 0 1 2.25 2.25v6.5a2.25 2.25 0 0 1-2.25 2.25h-6.5A2.25 2.25 0 0 1 2.5 12.25v-6.5ZM13.5 7.25l3.75-2.5v8.5l-3.75-2.5'
		},
		{
			title: `${courseOverview.totals.modules} carefully crafted modules (plus bonus)`,
			body: 'Progressing from fundamentals to advanced techniques, in the order you meet them.',
			icon: 'M3 5.5h14M3 10h14M3 14.5h9'
		},
		{
			title: 'Domestic machine only',
			body: 'No serger or overlocker needed — everything is sewn on the machine you already own.',
			icon: 'M10 3.25 11.6 7.4l4.4.35-3.35 2.87 1.02 4.28L10 12.65 6.33 14.9l1.02-4.28L4 7.75l4.4-.35L10 3.25Z'
		},
		{
			title: 'Bonus: haute couture project',
			body: 'Create a Chanel-inspired skirt that puts everything you have learned to work.',
			icon: 'M6.5 3.5h7l-1 3.5 3 9.5H4.5l3-9.5-1-3.5Z'
		}
	];
</script>

<svelte:head>
	<title>About Course - Skyler's Sewing Secrets</title>
	<meta name="description" content="Welcome to Skyler's Sewing Secrets - a couture-level sewing course with {courseOverview.totals.minutes} minutes of step-by-step tutorials across {courseOverview.totals.videos} videos. Learn professional finishing techniques using just a domestic sewing machine." />
	<meta property="og:title" content="About Course - Skyler's Sewing Secrets" />
	<meta property="og:description" content="A couture-level sewing course with {courseOverview.totals.minutes} minutes of step-by-step tutorials. Learn professional finishing techniques using just a domestic sewing machine." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/about" />
</svelte:head>

<!-- Editorial split: the promise on the left, the maker on the right. -->
<section class="relative isolate overflow-hidden">
	<div class="aurora -top-32 left-[-10%] h-[32rem] w-[32rem] bg-brand-200/35 animate-breathe" aria-hidden="true"></div>
	<div class="aurora bottom-[-16rem] right-[-6%] h-[32rem] w-[32rem] bg-sage-200/35" aria-hidden="true"></div>

	<div class="container-default pb-24 pt-16 sm:pb-28 sm:pt-24">
		<div class="grid items-center gap-16 lg:grid-cols-12 lg:gap-14">
			<div class="lg:col-span-6">
				<span class="eyebrow" use:reveal>About the tutorials</span>
				<h1 class="page-title mt-6 text-balance" use:reveal={{ delay: 60 }}>
					Couture-level sewing, <span class="italic text-brand-700">made accessible</span>
				</h1>
				<p class="mt-7 max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600" use:reveal={{ delay: 120 }}>
					Skyler's Sewing Secrets is a comprehensive, couture-level sewing course designed to unlock
					the beauty of fine garment finishing—no industrial equipment or prior experience in fashion
					school required.
				</p>

				<div class="mt-10 flex flex-wrap items-center gap-4" use:reveal={{ delay: 180 }}>
					<a href="/checkout" class="btn-primary btn-lg group">
						Start now
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
							</svg>
						</span>
					</a>
					<a href="/modules" class="btn-ghost btn-lg group">
						View the course
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</a>
				</div>

				<dl class="mt-14 space-y-7" use:reveal={{ delay: 240 }}>
					{#each pillars as pillar}
						<div class="flex gap-4">
							<span class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700 ring-1 ring-inset ring-sage-700/10">
								<svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d={pillar.icon} />
								</svg>
							</span>
							<div>
								<dt class="text-[15px] font-semibold text-charcoal-900">{pillar.title}</dt>
								<dd class="mt-1 text-[15px] leading-relaxed text-charcoal-600">{pillar.body}</dd>
							</div>
						</div>
					{/each}
				</dl>
			</div>

			<div class="lg:col-span-6" use:reveal={{ delay: 100 }}>
				<div class="shell-lg shadow-float transition-transform duration-1000 ease-fluid md:rotate-[1.5deg] md:hover:rotate-0">
					<div class="core-lg overflow-hidden">
						<OptimizedImage
							src="/images/portraits/portrait-1.jpg"
							alt="Skyler, founder of Skyler's Sewing Secrets"
							width={800}
							sizes="(min-width: 1024px) 48vw, 100vw"
							loading="eager"
							class="aspect-[4/5] w-full object-cover"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Why -->
<section class="section-alt border-y border-charcoal-900/[0.06]">
	<div class="container-default section">
		<div class="max-w-3xl" use:reveal>
			<span class="eyebrow-sage">Why Skyler's Sewing Secrets</span>
			<h2 class="section-title mt-6 text-balance">
				Because true craftsmanship is not about speed — it's about soul
			</h2>
			<p class="section-description mt-6 max-w-reading">
				In a world of fast fashion and shortcuts, Skyler invites you to slow down and rediscover the
				art of making something truly exceptional. With {courseOverview.totals.minutes} minutes of expert-guided
				tutorials, this course is more than a technical program—it's a transformation.
			</p>
			<p class="section-description mt-5 max-w-reading">
				This is where your skills meet intention, where precision becomes second nature, and where
				every stitch you sew tells a story of dedication, care, and creative pride.
			</p>
		</div>

		<div class="mt-16 grid gap-6 lg:grid-cols-2 lg:gap-8">
			<div use:reveal>
				<h3 class="subsection-heading">The value of investing in your craft</h3>
				<p class="mt-5 max-w-reading text-[17px] leading-[1.8] text-charcoal-600">
					When you invest in this course, you're not just buying a lesson—you're building a
					foundation that will serve you for a lifetime. You're gaining insider knowledge once
					reserved for couture houses, distilled into a program you can master at your own pace, from
					your own sewing table.
				</p>
				<p class="mt-5 max-w-reading text-[17px] leading-[1.8] text-charcoal-600">
					Whether you're building a brand, pursuing a fashion career, or sewing for pure joy, these
					skills are a legacy—and they will elevate everything you create.
				</p>
			</div>

			<div class="shell shadow-ambient" use:reveal={{ delay: 120 }}>
				<figure class="core flex h-full flex-col justify-center p-9 sm:p-11">
					<svg class="h-7 w-7 text-gold-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M9.5 5.5C6.5 6.9 4.5 9.7 4.5 13v5.5h6.2V13H7.6c0-2.3 1-3.9 2.9-4.8l-1-2.7Zm9 0c-3 1.4-5 4.2-5 7.5v5.5h6.2V13h-3.1c0-2.3 1-3.9 2.9-4.8l-1-2.7Z" />
					</svg>
					<blockquote class="mt-6 font-serif text-[1.5rem] italic leading-snug text-charcoal-800 sm:text-[1.75rem]">
						Fashion is not necessarily about labels. It's not about brands. It's about something else
						that comes from within you.
					</blockquote>
					<figcaption class="mt-7 text-[11px] uppercase tracking-eyebrow text-charcoal-400">
						Ralph Lauren
					</figcaption>
				</figure>
			</div>
		</div>
	</div>
</section>

<!-- Closing -->
<section class="relative isolate overflow-hidden bg-charcoal-950">
	<div class="aurora left-[-6%] top-[-10rem] h-[28rem] w-[28rem] bg-brand-700/25 animate-breathe" aria-hidden="true"></div>
	<div class="aurora bottom-[-14rem] right-[-6%] h-[30rem] w-[30rem] bg-sage-700/25" aria-hidden="true"></div>

	<div class="container-default py-28 sm:py-36">
		<div class="mx-auto max-w-3xl text-center" use:reveal>
			<h2 class="font-serif text-[2.5rem] leading-[1.05] tracking-tight text-ivory-50 sm:text-[3.5rem]">
				Sew with purpose.
				<span class="block italic text-brand-300">Finish with pride.</span>
			</h2>
			<p class="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-charcoal-300">
				Let's begin this journey together. One stitch at a time.
			</p>
			<p class="mt-4 font-serif text-[1.375rem] italic text-charcoal-400">With love, Skyler</p>

			<div class="mt-11 flex flex-wrap items-center justify-center gap-4">
				<a href="/checkout" class="btn btn-lg group bg-ivory-50 text-charcoal-900 shadow-float hover:bg-white">
					Enrol now
					<span class="btn-orb bg-charcoal-900/[0.08]" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
						</svg>
					</span>
				</a>
				<a href="/modules" class="btn btn-lg group text-ivory-200 ring-1 ring-inset ring-white/15 hover:bg-white/[0.06] hover:text-ivory-50">
					View the course
					<span class="btn-orb bg-white/10" aria-hidden="true">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
						</svg>
					</span>
				</a>
			</div>
		</div>
	</div>
</section>
