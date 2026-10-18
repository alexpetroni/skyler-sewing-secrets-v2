<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import Seo from '#lib/components/Seo.svelte';
	import AddToCartButton from '#lib/components/shop/AddToCartButton.svelte';
	import PriceTag from '#lib/components/shop/PriceTag.svelte';
	import { KIND_LABELS, type ShopLesson, type ShopProduct } from '#lib/components/shop/types.ts';
	import { durationMinutes, formatMinutes } from '#lib/shared/lessons.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const product: ShopProduct = $derived(data.product);
	const minutes = $derived(durationMinutes(product.durationSeconds));
</script>

<Seo
	title="{product.title} - Skyler's Sewing Secrets"
	description={product.tagline ?? `${KIND_LABELS[product.kind]} from Skyler's Sewing Secrets.`}
	path="/products/{product.slug}"
	image={product.coverImageUrl}
/>

{#snippet lessonRow(lesson: ShopLesson)}
	<li class="flex items-center justify-between gap-4 py-3.5 text-[15px]">
		<span class="min-w-0 truncate text-charcoal-800">{lesson.title}</span>
		<span class="flex shrink-0 items-center gap-3 text-[13px] text-charcoal-400">
			{#if lesson.previewHref}
				<a href={lesson.previewHref} class="link">Free preview</a>
			{/if}
			{#if durationMinutes(lesson.durationSeconds)}
				<span>{formatMinutes(durationMinutes(lesson.durationSeconds) ?? 0)}</span>
			{/if}
		</span>
	</li>
{/snippet}

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-24 left-[-8%] h-[26rem] w-[26rem] bg-brand-200/30"
		aria-hidden="true"
	></div>

	<div class="container-default grid gap-12 pt-12 pb-24 sm:pt-16 lg:grid-cols-12">
		<div class="lg:col-span-7">
			<span class="eyebrow">{KIND_LABELS[product.kind]}</span>
			<h1 class="page-title mt-6 text-balance">{product.title}</h1>
			{#if product.tagline}
				<p class="section-description mt-5 max-w-reading">{product.tagline}</p>
			{/if}

			{#if product.coverImageUrl}
				<img
					src={product.coverImageUrl}
					alt=""
					class="mt-10 aspect-[16/10] w-full rounded-core-lg object-cover shadow-ambient"
				/>
			{/if}

			{#if data.descriptionHtml}
				<div class="prose-editorial mt-10">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- description_html is written by the content sanitiser at save time -->
					{@html data.descriptionHtml}
				</div>
			{/if}

			<div class="mt-14">
				<div class="flex items-center gap-4">
					<h2 class="shrink-0 text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
						{data.isFlagship ? 'Course outline' : "What's included"}
					</h2>
					<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
				</div>

				{#if data.isFlagship}
					{#each data.outline as module, i (i)}
						<h3 class="card-title mt-8">{module.title}</h3>
						<ul class="mt-2 divide-y divide-charcoal-900/[0.06]">
							{#each module.lessons as lesson (lesson.id)}
								{@render lessonRow(lesson)}
							{/each}
						</ul>
					{/each}
				{:else}
					<ul class="mt-4 divide-y divide-charcoal-900/[0.06]">
						{#each data.lessons as lesson (lesson.id)}
							{@render lessonRow(lesson)}
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<aside class="lg:col-span-5">
			<div class="shell shadow-float lg:sticky lg:top-28">
				<div class="core p-8">
					<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
						Pay once, own it forever
					</p>
					<PriceTag
						class="mt-5"
						size="lg"
						price={product.pricing.price}
						listPrice={product.pricing.listPrice}
						onSale={product.pricing.onSale}
						saleEndsAt={product.pricing.saleEndsAt}
					/>
					<p class="meta mt-4">
						{product.itemCount}
						{product.itemCount === 1 ? 'video' : 'videos'}{#if minutes}<span aria-hidden="true">
								·
							</span>{formatMinutes(minutes)}{/if}
					</p>

					{#if data.owned}
						<p class="mt-8 text-[15px] text-charcoal-700">You own this.</p>
						<a href="/library" class="btn-primary mt-4 w-full">Go to your library</a>
					{:else}
						<AddToCartButton productId={product.id} inCart={data.inCart} class="mt-8" />
						{#if data.inCart}
							<a href="/cart" class="btn-secondary mt-3 w-full">View cart</a>
						{/if}
					{/if}
				</div>
			</div>
		</aside>
	</div>
</section>
