<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import Seo from '#lib/components/Seo.svelte';
	import type { PageData } from './$types';
	import PageHeader from '#lib/components/layout/PageHeader.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { reveal } from '#lib/actions/reveal.ts';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const openItems = new SvelteSet<string>();

	function toggleItem(id: string) {
		if (openItems.has(id)) openItems.delete(id);
		else openItems.add(id);
	}
</script>

<Seo
	title="Frequently Asked Questions - Skyler's Sewing Secrets"
	description="Find answers to common questions about Skyler's Sewing Secrets course, including access, payment, and course content."
/>

<PageHeader
	eyebrow="Answers"
	title="Frequently asked questions"
	lede="Access, devices, payment and pace — the things worth knowing before you enrol."
/>

<section class="container-default pb-24 sm:pb-32">
	<div class="mx-auto max-w-4xl">
		{#if data.groups.length > 0}
			<div class="space-y-16">
				{#each data.groups as group (group.category)}
					<div use:reveal>
						<h2
							class="flex items-center gap-4 text-[10px] tracking-eyebrow text-charcoal-400 uppercase"
						>
							{group.category || 'General'}
							<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
						</h2>

						<dl class="mt-7 space-y-3">
							{#each group.items as faq (faq.id)}
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
												<span class="text-[16px] leading-snug font-medium text-charcoal-900">
													{faq.question}
												</span>
												<span
													class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-600 ease-fluid {isOpen
														? 'rotate-45'
														: ''}"
													aria-hidden="true"
												>
													<svg
														class="h-3.5 w-3.5"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														stroke-width="1.25"
														stroke-linecap="round"
													>
														<path d="M8 3.5v9M3.5 8h9" />
													</svg>
												</span>
											</button>
										</dt>
										{#if isOpen}
											<dd class="animate-drift-in px-6 pb-6 sm:px-7">
												<div
													class="prose prose-sm max-w-reading text-[15px] leading-[1.75] text-charcoal-600 prose-a:text-charcoal-900"
												>
													<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitiser output (answer_html, or the legacy answer rendered through renderMarkdown) -->
													{@html faq.html}
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
							<svg
								class="h-3.5 w-3.5"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
							</svg>
						</span>
					</a>
				</div>
			</div>
		{/if}

		<div
			class="mt-20 rounded-shell bg-ivory-100 px-8 py-14 text-center ring-1 ring-charcoal-900/[0.06] ring-inset sm:px-12"
			use:reveal
		>
			<h2 class="section-title text-balance">Still have questions?</h2>
			<p class="section-description mx-auto mt-5 max-w-lg">
				Can't find the answer you're looking for? Get in touch with me directly.
			</p>
			<a href="/contact" class="btn-primary group mt-9">
				Contact us
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
	</div>
</section>
