<script lang="ts">
	interface Props {
		embedUrl: string | null;
		title?: string;
		/** Resume point in seconds, appended to the signed embed URL as `&t=`. */
		startAt?: number;
		class?: string;
	}

	let { embedUrl, title = 'Video', startAt, class: className = '' }: Props = $props();

	const src = $derived(embedUrl && startAt ? `${embedUrl}&t=${Math.floor(startAt)}` : embedUrl);
</script>

<div class="aspect-video w-full overflow-hidden rounded-core bg-charcoal-950 {className}">
	{#if src}
		<iframe
			{src}
			{title}
			loading="lazy"
			allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
			allowfullscreen
			class="h-full w-full"
		></iframe>
	{:else}
		<div class="flex h-full items-center justify-center text-charcoal-400">
			<p>Video unavailable</p>
		</div>
	{/if}
</div>
