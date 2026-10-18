<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base
	   path, as in legacy; most targets are routes added by later phases, which typed resolve()
	   rejects. */
	import VideoPlayer from '#lib/components/course/VideoPlayer.svelte';
	import { reveal } from '#lib/actions/reveal.ts';

	interface Props {
		/** Signed embed URL of the free-preview lesson; null shows the unavailable state. */
		embedUrl: string | null;
		/** The free-preview lesson's title. */
		title: string;
		description?: string | null;
		/** Videos in the course, for the unlock call to action. */
		videoCount: number;
		enrolHref: string;
	}

	let { embedUrl, title, description = null, videoCount, enrolHref }: Props = $props();
</script>

<section class="section relative isolate overflow-hidden" id="free-preview">
	<div
		class="aurora top-10 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 bg-brand-200/30"
		aria-hidden="true"
	></div>

	<div class="container-default">
		<div class="section-header" use:reveal>
			<span class="eyebrow">Try before you buy</span>
			<h2 class="section-title mt-6 text-balance">A whole lesson, on the house</h2>
			<p class="section-description mt-5">
				This is exactly how every tutorial is filmed and paced. Watch it, sew it, then decide.
			</p>
		</div>

		<div class="mx-auto max-w-4xl" use:reveal={{ delay: 120 }}>
			<div class="shell-lg shadow-float">
				<div class="core-lg overflow-hidden">
					<VideoPlayer {embedUrl} {title} class="rounded-none" />
					<div
						class="flex flex-col gap-5 px-7 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-7"
					>
						<div>
							<p class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Free tutorial</p>
							<h3 class="card-title mt-2">{title}</h3>
							{#if description}
								<p class="mt-1.5 text-[15px] leading-relaxed text-charcoal-600">
									{description}
								</p>
							{/if}
						</div>
						<a href={enrolHref} class="btn-primary group shrink-0">
							Unlock all {videoCount}
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
			</div>
		</div>
	</div>
</section>
