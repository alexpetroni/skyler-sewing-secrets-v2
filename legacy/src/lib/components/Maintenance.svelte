<script lang="ts">
	const stitches = Array.from({ length: 12 }, (_, i) => ({
		delay: `${i * 0.15}s`,
		left: `${8 + i * 7.5}%`
	}));
</script>

<section class="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-20">
	<div class="aurora -top-32 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 bg-brand-200/35 animate-breathe" aria-hidden="true"></div>
	<div class="aurora -bottom-40 right-[-10%] h-[28rem] w-[28rem] bg-sage-200/30" aria-hidden="true"></div>

	<div class="w-full max-w-lg text-center">
		<img src="/logo/logo.png" alt="Skyler's Sewing Secrets" class="mx-auto h-16 w-auto" />

		<!-- A seam being sewn, stitch by stitch. -->
		<div class="relative mx-10 mb-12 mt-12 h-4">
			{#each stitches as stitch}
				<span
					class="stitch-dash absolute top-1/2 h-px w-4 -translate-y-1/2 rounded-full bg-gold-400 opacity-0"
					style="left: {stitch.left}; animation-delay: {stitch.delay};"
				></span>
			{/each}
		</div>

		<span class="eyebrow">Back shortly</span>

		<h1 class="page-title mt-6">Stitching things up</h1>

		<p class="section-description mx-auto mt-6 max-w-sm">
			We're making some updates behind the scenes to give you a better experience.
		</p>

		<p class="mt-4 text-[14px] text-charcoal-400">
			Sorry for the inconvenience — we'll be back soon.
		</p>

		<div class="mt-14 flex justify-center">
			<svg class="animate-spin-slow h-11 w-11 text-charcoal-300" viewBox="0 0 48 48" fill="none" aria-hidden="true">
				<circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="1.25" stroke-dasharray="6 4" />
				<circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="1.25" />
				<circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.3" />
			</svg>
		</div>
	</div>
</section>

<style>
	.stitch-dash {
		animation: stitch 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
	}

	@keyframes stitch {
		0%,
		100% {
			opacity: 0.15;
			transform: translateY(-50%) scaleX(0.6);
		}
		50% {
			opacity: 1;
			transform: translateY(-50%) scaleX(1);
		}
	}

	:global(.animate-spin-slow) {
		animation: spin 12s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
