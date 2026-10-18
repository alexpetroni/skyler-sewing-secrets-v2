<script lang="ts">
	import VideoPlayer from '$lib/components/course/VideoPlayer.svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		embedUrl: string | null;
	}

	let { embedUrl }: Props = $props();
</script>

<section class="section relative isolate overflow-hidden" id="free-preview">
	<div class="aurora left-1/2 top-10 h-[26rem] w-[26rem] -translate-x-1/2 bg-brand-200/30" aria-hidden="true"></div>

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
					<VideoPlayer
						{embedUrl}
						title="Mitred Corner"
						class="rounded-none"
					/>
					<div class="flex flex-col gap-5 px-7 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-7">
						<div>
							<p class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Free tutorial</p>
							<h3 class="card-title mt-2">Mitred Corner</h3>
							<p class="mt-1.5 text-[15px] leading-relaxed text-charcoal-600">
								Create perfectly angled corners for hems, borders, and bindings.
							</p>
						</div>
						<a href="/checkout" class="btn-primary group shrink-0">
							Unlock all 40
							<span class="btn-orb" aria-hidden="true">
								<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
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
