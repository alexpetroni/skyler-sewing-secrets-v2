<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let openItems = $state<Set<string>>(new Set());

	function toggleItem(id: string) {
		const next = new Set(openItems);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		openItems = next;
	}

	const groupedFaqs = $derived(() => {
		const groups: Record<string, typeof data.faqs> = {};
		for (const faq of data.faqs) {
			const category = faq.category || 'General';
			groups[category] ??= [];
			groups[category].push(faq);
		}
		return groups;
	});
</script>

<svelte:head>
	<title>Frequently Asked Questions - Skyler's Sewing Secrets</title>
	<meta name="description" content="Find answers to common questions about Skyler's Sewing Secrets course, including access, payment, and course content." />
	<meta property="og:title" content="FAQ - Skyler's Sewing Secrets" />
	<meta property="og:description" content="Find answers to common questions about Skyler's Sewing Secrets course, including access, payment, and course content." />
	<meta property="og:image" content="https://skyler-storage.b-cdn.net/images/portraits/portrait-1.jpg" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://skylersewingsecrets.com/faq" />
</svelte:head>

<PageHeader
	eyebrow="Answers"
	title="Frequently asked questions"
	lede="Access, devices, payment and pace — the things worth knowing before you enrol."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-4xl">
		{#if data.faqs.length > 0}
			<div class="space-y-16">
				{#each Object.entries(groupedFaqs()) as [category, faqs]}
					<div use:reveal>
						<h2 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
							{category}
							<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
						</h2>

						<dl class="mt-7 space-y-3">
							{#each faqs as faq}
								{@const isOpen = openItems.has(faq.id)}
								<div
									class="shell transition-shadow duration-600 ease-fluid {isOpen
										? 'shadow-lift'
										: 'shadow-ambient'}"
								>
									<div class="core overflow-hidden">
										<dt>
											<button
												type="button"
												class="flex w-full items-start justify-between gap-6 px-6 py-5 text-left sm:px-7"
												onclick={() => toggleItem(faq.id)}
												aria-expanded={isOpen}
											>
												<span class="text-[16px] font-medium leading-snug text-charcoal-900">
													{faq.question}
												</span>
												<span
													class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-600 ease-fluid {isOpen
														? 'rotate-45'
														: ''}"
													aria-hidden="true"
												>
													<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
														<path d="M8 3.5v9M3.5 8h9" />
													</svg>
												</span>
											</button>
										</dt>
										{#if isOpen}
											<dd class="animate-drift-in px-6 pb-6 sm:px-7">
												<div class="prose prose-sm max-w-reading text-[15px] leading-[1.75] text-charcoal-600 prose-a:text-charcoal-900">
													{@html faq.answer}
												</div>
											</dd>
										{/if}
									</div>
								</div>
							{/each}
						</dl>
					</div>
				{/each}
			</div>
		{:else}
			<div class="shell shadow-ambient" use:reveal>
				<div class="core px-8 py-16 text-center">
					<h2 class="card-title">Questions are on their way</h2>
					<p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-charcoal-600">
						The FAQ is being written up. In the meantime, ask Skyler directly — every message gets a
						real answer.
					</p>
					<a href="/contact" class="btn-secondary group mt-8">
						Ask a question
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</a>
				</div>
			</div>
		{/if}

		<div class="mt-20 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-inset ring-charcoal-900/[0.06] sm:px-12" use:reveal>
			<h2 class="section-title text-balance">Still have questions?</h2>
			<p class="section-description mx-auto mt-5 max-w-lg">
				Can't find the answer you're looking for? Get in touch with me directly.
			</p>
			<a href="/contact" class="btn-primary group mt-9">
				Contact us
				<span class="btn-orb" aria-hidden="true">
					<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
					</svg>
				</span>
			</a>
		</div>
	</div>
</section>
