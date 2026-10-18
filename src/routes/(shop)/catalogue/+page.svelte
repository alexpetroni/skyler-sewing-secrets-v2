<script lang="ts">
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import ProductCard from '#lib/components/shop/ProductCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const groups = $derived(
		[
			{ title: 'Bundles', lede: 'Focused sets of lessons on one technique.', cards: data.bundles },
			{ title: 'Single videos', lede: 'One technique, one video.', cards: data.singles }
		].filter((group) => group.cards.length > 0)
	);
</script>

<Seo
	title="Catalogue - Skyler's Sewing Secrets"
	description="The complete sewing course, focused bundles and single video tutorials from Skyler."
	path="/catalogue"
/>

<PageHeader
	eyebrow="The catalogue"
	title="Learn at your own pace"
	lede="The full course, or just the techniques you need. Pay once, keep them forever."
/>

<section class="container-default pb-24 sm:pb-32">
	{#if data.flagship}
		<div class="mx-auto max-w-xl" use:reveal>
			<ProductCard
				product={data.flagship.product}
				owned={data.flagship.owned}
				inCart={data.flagship.inCart}
			/>
		</div>
	{/if}

	{#each groups as group (group.title)}
		<div class="mt-20">
			<div class="section-header" use:reveal>
				<h2 class="section-title text-balance">{group.title}</h2>
				<p class="section-description mt-4">{group.lede}</p>
			</div>
			<ul class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each group.cards as card (card.product.id)}
					<li use:reveal>
						<ProductCard product={card.product} owned={card.owned} inCart={card.inCart} />
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<div class="mx-auto mt-16 max-w-md text-center" use:reveal>
			<p class="subsection-heading">More on the way</p>
			<p class="mt-3 text-[15px] leading-relaxed text-charcoal-600">
				Bundles and single video tutorials are coming soon. In the meantime, the full course
				includes every lesson.
			</p>
		</div>
	{/each}
</section>
