<script lang="ts">
	import Maintenance from '#lib/components/Maintenance.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import {
		Cta,
		Features,
		FreePreview,
		Hero,
		Instructor,
		Offer,
		Testimonials,
		productHref,
		slideCount
	} from '#lib/components/marketing/index.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if data.maintenance}
	<Seo
		title="We'll Be Back Soon - Skyler's Sewing Secrets"
		description="Skyler's Sewing Secrets is currently undergoing maintenance. We'll be back shortly."
		noindex
	/>
	<Maintenance />
{:else}
	{@const enrolHref = productHref(data.flagship)}
	<Seo
		title="Skyler's Sewing Secrets - Master Professional Sewing Techniques"
		description="Learn professional sewing techniques with Skyler's comprehensive video course. From basics to advanced couture methods, get lifetime access to expert guidance."
	/>
	<Hero totals={data.outline.totals} {enrolHref} />
	<Features outline={data.outline} />
	{#if data.freePreview}
		<FreePreview
			embedUrl={data.freePreview.embedUrl}
			title={data.freePreview.title}
			description={data.freePreview.description}
			videoCount={data.outline.totals.videos}
			{enrolHref}
		/>
	{/if}
	{#if data.flagship}
		<Offer product={data.flagship} totals={data.outline.totals} slides={slideCount(data.outline)} />
	{/if}
	<Instructor />
	<Testimonials testimonials={data.testimonials} />
	<Cta product={data.flagship} />
{/if}
