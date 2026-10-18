<script lang="ts">
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';
	import { reveal } from '$lib/actions/reveal';

	const milestones = [
		{ value: '40+', label: 'Years at the machine' },
		{ value: '5', label: 'Fashion capitals' },
		{ value: '6', label: 'Ateliers & houses' }
	];
</script>

<section class="section relative isolate overflow-hidden">
	<div class="aurora left-[-10%] top-1/3 h-[30rem] w-[30rem] bg-brand-200/30" aria-hidden="true"></div>

	<div class="container-default">
		<div class="grid items-start gap-14 lg:grid-cols-12 lg:gap-16">
			<!-- Portrait sits in a tray, tilted the other way to the hero's. -->
			<div class="lg:sticky lg:top-32 lg:col-span-5" use:reveal>
				<div class="shell-lg shadow-float transition-transform duration-1000 ease-fluid md:rotate-[1.5deg] md:hover:rotate-0">
					<div class="core-lg overflow-hidden">
						<OptimizedImage
							src="/images/portraits/portrait-2.jpg"
							alt="Skyler, founder of Skyler's Sewing Secrets"
							width={700}
							sizes="(min-width: 1024px) 40vw, 100vw"
							class="aspect-[4/5] w-full object-cover object-top"
						/>
					</div>
				</div>

				<dl class="mt-8 grid grid-cols-3 gap-4">
					{#each milestones as item}
						<div class="rounded-2xl bg-white/60 px-4 py-4 text-center ring-1 ring-inset ring-charcoal-900/[0.06]">
							<dt class="font-serif text-[1.5rem] leading-none text-charcoal-900">{item.value}</dt>
							<dd class="mt-2 text-[10px] uppercase tracking-eyebrow text-charcoal-400">{item.label}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<div class="lg:col-span-7" use:reveal={{ delay: 120 }}>
				<span class="eyebrow-sage">Meet your instructor</span>
				<h2 class="section-title mt-6">Skyler</h2>

				<blockquote class="mt-8 border-l-2 border-gold-400 pl-6 font-serif text-[1.5rem] italic leading-snug text-charcoal-700 sm:text-[1.75rem]">
					Some things are only learned by watching hands work.
				</blockquote>

				<div class="mt-9 space-y-6">
					<p class="max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600">
						It all started very early—around the age of six—with a pair of scissors and a grandmother
						who had clients coming and going. Fabric quickly revealed itself as something full of
						possibilities. By sixteen, dresses were being made out of whatever was available: flags,
						curtains, drapery fabrics. If it could be stitched, it deserved a chance.
					</p>
					<p class="max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600">
						The craft was learned the old way, beside master tailors in fashion houses, where time
						mattered and the inside of the garment was treated with the same respect as the outside.
						From there, sewing became a passport: London, Paris, New York, Lisbon, Bali—catwalks,
						haute couture, bridal ateliers, made-to-measure salons, theatre productions, cabaret
						stages.
					</p>
					<p class="max-w-reading text-pretty text-[17px] leading-[1.8] text-charcoal-600">
						After more than forty years in the industry, the excitement hasn't faded. What matters
						most now is passing on the quiet knowledge that never makes it into textbooks—the small
						habits, the couture tricks, the patience that turns work into something truly finished.
						Skyler's Sewing Secrets exists for those who care about neatness, time, and the deep
						satisfaction of garments that are as beautiful on the inside as they are on the outside.
					</p>
				</div>

				<p class="mt-10 flex items-center gap-3 text-[11px] uppercase tracking-eyebrow text-charcoal-400">
					<span class="h-px w-10 bg-charcoal-900/15"></span>
					Founder of Skyler's Sewing Secrets
				</p>
			</div>
		</div>
	</div>
</section>
